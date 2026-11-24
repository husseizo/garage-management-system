-- Phase 1B — customers, contacts, vehicles, registration and ownership history, rate limiting.
-- Additive only: creates extensions, enums, tables, indexes and constraints; adds two nullable
-- columns to audit_logs (metadata-only). No existing object is dropped or rewritten.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "CustomerKind" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC', 'LPG', 'OTHER');

-- CreateEnum
CREATE TYPE "OwnershipRole" AS ENUM ('OWNER', 'KEEPER');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "subject_customer_id" UUID,
ADD COLUMN     "subject_vehicle_id" UUID;

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" "CustomerKind" NOT NULL,
    "given_name" TEXT,
    "family_name" TEXT,
    "company_name" TEXT,
    "tax_id" TEXT,
    "display_name" TEXT NOT NULL,
    "search_name" TEXT NOT NULL,
    "preferred_language" CHAR(2) NOT NULL DEFAULT 'sw',
    "notes" TEXT,
    "created_by_staff_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "kind" "ContactKind" NOT NULL,
    "value_raw" TEXT NOT NULL,
    "value_normalised" TEXT NOT NULL,
    "label" TEXT,
    "contact_person_name" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "vin_raw" TEXT,
    "vin_normalised" TEXT,
    "chassis_number" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT,
    "model_year" SMALLINT,
    "fuel_type" "FuelType",
    "colour" TEXT,
    "engine_number" TEXT,
    "search_text" TEXT NOT NULL,
    "created_by_staff_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_registrations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "vehicle_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "plate_raw" TEXT NOT NULL,
    "plate_normalised" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3),
    "recorded_by_staff_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_ownerships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "vehicle_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "role" "OwnershipRole" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "source" TEXT NOT NULL,
    "recorded_by_staff_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(100) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE INDEX "customers_search_name_trgm_idx" ON "customers" USING GIN ("search_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "customers_created_at_idx" ON "customers"("created_at" DESC);

-- CreateIndex
CREATE INDEX "customers_created_by_idx" ON "customers"("created_by_staff_user_id");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_idx" ON "customer_contacts"("customer_id");

-- CreateIndex
CREATE INDEX "customer_contacts_lookup_idx" ON "customer_contacts"("kind", "value_normalised");

-- CreateIndex
CREATE INDEX "vehicles_vin_idx" ON "vehicles"("vin_normalised");

-- CreateIndex
CREATE INDEX "vehicles_search_text_trgm_idx" ON "vehicles" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "vehicles_created_by_idx" ON "vehicles"("created_by_staff_user_id");

-- CreateIndex
CREATE INDEX "vehicle_registrations_vehicle_idx" ON "vehicle_registrations"("vehicle_id", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "vehicle_registrations_plate_trgm_idx" ON "vehicle_registrations" USING GIN ("plate_normalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "vehicle_registrations_recorded_by_idx" ON "vehicle_registrations"("recorded_by_staff_user_id");

-- CreateIndex
CREATE INDEX "vehicle_ownerships_vehicle_idx" ON "vehicle_ownerships"("vehicle_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "vehicle_ownerships_customer_idx" ON "vehicle_ownerships"("customer_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "vehicle_ownerships_recorded_by_idx" ON "vehicle_ownerships"("recorded_by_staff_user_id");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_subject_customer_idx" ON "audit_logs"("subject_customer_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_subject_vehicle_idx" ON "audit_logs"("subject_vehicle_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_staff_user_id_fkey" FOREIGN KEY ("created_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_created_by_staff_user_id_fkey" FOREIGN KEY ("created_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_registrations" ADD CONSTRAINT "vehicle_registrations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_registrations" ADD CONSTRAINT "vehicle_registrations_recorded_by_staff_user_id_fkey" FOREIGN KEY ("recorded_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_ownerships" ADD CONSTRAINT "vehicle_ownerships_recorded_by_staff_user_id_fkey" FOREIGN KEY ("recorded_by_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── customers ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_kind_names" CHECK (
    ("kind" = 'INDIVIDUAL' AND "company_name" IS NULL AND "tax_id" IS NULL
       AND ("given_name" IS NOT NULL OR "family_name" IS NOT NULL))
    OR ("kind" = 'COMPANY' AND "company_name" IS NOT NULL
       AND "given_name" IS NULL AND "family_name" IS NULL)),
  ADD CONSTRAINT "customers_given_name_len" CHECK ("given_name" IS NULL OR char_length(btrim("given_name")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "customers_family_name_len" CHECK ("family_name" IS NULL OR char_length(btrim("family_name")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "customers_company_name_len" CHECK ("company_name" IS NULL OR char_length(btrim("company_name")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "customers_tax_id_format" CHECK ("tax_id" IS NULL OR "tax_id" ~ '^[0-9A-Z]{3,20}$'),
  ADD CONSTRAINT "customers_display_name_len" CHECK (char_length(btrim("display_name")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "customers_search_name_consistent" CHECK ("search_name" = lower("display_name")),
  ADD CONSTRAINT "customers_preferred_language" CHECK ("preferred_language" IN ('sw', 'en')),
  ADD CONSTRAINT "customers_notes_len" CHECK ("notes" IS NULL OR char_length("notes") <= 2000);

-- ─── customer_contacts ────────────────────────────────────────────────────────────────────────
-- A phone/email may be shared by several customers (owner decision D-05): no global uniqueness.
ALTER TABLE "customer_contacts"
  ADD CONSTRAINT "customer_contacts_value_format" CHECK (
    ("kind" = 'PHONE' AND "value_normalised" ~ '^\+[1-9][0-9]{6,14}$')
    OR ("kind" = 'EMAIL' AND "value_normalised" = lower("value_normalised")
        AND "value_normalised" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        AND char_length("value_normalised") <= 254)),
  ADD CONSTRAINT "customer_contacts_value_raw_len" CHECK (char_length("value_raw") BETWEEN 1 AND 254),
  ADD CONSTRAINT "customer_contacts_label_len" CHECK ("label" IS NULL OR char_length("label") <= 50),
  ADD CONSTRAINT "customer_contacts_person_len" CHECK ("contact_person_name" IS NULL OR char_length("contact_person_name") <= 100),
  ADD CONSTRAINT "customer_contacts_one_primary"
    EXCLUDE USING btree ("customer_id" WITH =, "kind" WITH =) WHERE ("is_primary" AND "deleted_at" IS NULL),
  ADD CONSTRAINT "customer_contacts_no_duplicate"
    EXCLUDE USING btree ("customer_id" WITH =, "kind" WITH =, "value_normalised" WITH =) WHERE ("deleted_at" IS NULL);

-- ─── vehicles ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_vin_format" CHECK ("vin_normalised" IS NULL OR "vin_normalised" ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  ADD CONSTRAINT "vehicles_vin_pair" CHECK (("vin_raw" IS NULL) = ("vin_normalised" IS NULL)),
  ADD CONSTRAINT "vehicles_make_len" CHECK (char_length(btrim("make")) BETWEEN 1 AND 60),
  ADD CONSTRAINT "vehicles_model_len" CHECK ("model" IS NULL OR char_length(btrim("model")) BETWEEN 1 AND 60),
  ADD CONSTRAINT "vehicles_model_year_range" CHECK ("model_year" IS NULL OR "model_year" BETWEEN 1900 AND 2100),
  ADD CONSTRAINT "vehicles_short_fields_len" CHECK (
    ("colour" IS NULL OR char_length("colour") <= 40)
    AND ("chassis_number" IS NULL OR char_length("chassis_number") <= 30)
    AND ("engine_number" IS NULL OR char_length("engine_number") <= 30)),
  ADD CONSTRAINT "vehicles_search_text_consistent" CHECK ("search_text" = lower(btrim("make" || ' ' || coalesce("model", '')))),
  ADD CONSTRAINT "vehicles_vin_unique_active"
    EXCLUDE USING btree ("vin_normalised" WITH =) WHERE ("vin_normalised" IS NOT NULL AND "deleted_at" IS NULL);

-- ─── vehicle_registrations (plate history, BR-04) ───────────────────────────────────────────────
ALTER TABLE "vehicle_registrations"
  ADD CONSTRAINT "vehicle_registrations_country_code" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "vehicle_registrations_plate_format" CHECK ("plate_normalised" ~ '^[A-Z0-9]{2,12}$'),
  ADD CONSTRAINT "vehicle_registrations_plate_raw_len" CHECK (char_length("plate_raw") BETWEEN 1 AND 20),
  ADD CONSTRAINT "vehicle_registrations_period" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from"),
  ADD CONSTRAINT "vehicle_registrations_plate_no_overlap"
    EXCLUDE USING gist ("country_code" WITH =, "plate_normalised" WITH =, tstzrange("valid_from", "valid_to", '[)') WITH &&),
  ADD CONSTRAINT "vehicle_registrations_vehicle_no_overlap"
    EXCLUDE USING gist ("vehicle_id" WITH =, tstzrange("valid_from", "valid_to", '[)') WITH &&);

-- ─── vehicle_ownerships (BR-05) ───────────────────────────────────────────────────────────────
ALTER TABLE "vehicle_ownerships"
  ADD CONSTRAINT "vehicle_ownerships_period" CHECK ("ended_at" IS NULL OR "ended_at" > "started_at"),
  ADD CONSTRAINT "vehicle_ownerships_source" CHECK ("source" IN ('REGISTRATION', 'TRANSFER', 'CORRECTION')),
  ADD CONSTRAINT "vehicle_ownerships_one_owner"
    EXCLUDE USING gist ("vehicle_id" WITH =, tstzrange("started_at", "ended_at", '[)') WITH &&) WHERE ("role" = 'OWNER'),
  ADD CONSTRAINT "vehicle_ownerships_keeper_no_overlap"
    EXCLUDE USING gist ("vehicle_id" WITH =, "customer_id" WITH =, tstzrange("started_at", "ended_at", '[)') WITH &&) WHERE ("role" = 'KEEPER');

-- ─── rate_limit_buckets ───────────────────────────────────────────────────────────────────────
ALTER TABLE "rate_limit_buckets"
  ADD CONSTRAINT "rate_limit_buckets_count_non_negative" CHECK ("count" >= 0),
  ADD CONSTRAINT "rate_limit_buckets_expiry" CHECK ("expires_at" > "window_start");

-- ─── audit_logs: subject ids are UUIDs written by value (ADR 0012) ──────────────────────────────
-- (columns added above; the append-only trigger is unaffected by ADD COLUMN)
