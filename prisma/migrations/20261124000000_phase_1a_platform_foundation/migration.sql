-- Phase 1A — shared platform foundation: garage_profile (singleton) and audit_logs (append-only).
-- Additive only: creates one enum, two tables, indexes, constraints and a trigger. No existing
-- object is altered or dropped. Requires PostgreSQL 18+ for uuidv7().

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('STAFF', 'CUSTOMER', 'SYSTEM');

-- CreateTable
CREATE TABLE "garage_profile" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "display_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "country_code" CHAR(2) NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "contact_phone_e164" TEXT,
    "contact_email" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postal_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "garage_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_staff_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "request_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "garage_profile_singleton_key" ON "garage_profile"("singleton");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_staff_idx" ON "audit_logs"("actor_staff_user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_staff_user_id_fkey" FOREIGN KEY ("actor_staff_user_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── CHECK constraints (not modelled by Prisma) ──────────────────────────────────────────────

ALTER TABLE "garage_profile"
  ADD CONSTRAINT "garage_profile_singleton_true" CHECK ("singleton" = true),
  ADD CONSTRAINT "garage_profile_display_name_len" CHECK (char_length(btrim("display_name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "garage_profile_legal_name_len" CHECK ("legal_name" IS NULL OR char_length(btrim("legal_name")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "garage_profile_country_code_iso" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "garage_profile_currency_code_iso" CHECK ("currency_code" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "garage_profile_timezone_iana" CHECK ("timezone" ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$' AND char_length("timezone") <= 64),
  ADD CONSTRAINT "garage_profile_contact_phone_e164" CHECK ("contact_phone_e164" IS NULL OR "contact_phone_e164" ~ '^\+[1-9][0-9]{6,14}$'),
  ADD CONSTRAINT "garage_profile_contact_email_format" CHECK ("contact_email" IS NULL OR ("contact_email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length("contact_email") <= 254));

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_staff_actor_consistent" CHECK (("actor_type" = 'STAFF') = ("actor_staff_user_id" IS NOT NULL)),
  ADD CONSTRAINT "audit_logs_action_format" CHECK ("action" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' AND char_length("action") <= 100),
  ADD CONSTRAINT "audit_logs_entity_pair" CHECK (("entity_type" IS NULL) = ("entity_id" IS NULL)),
  ADD CONSTRAINT "audit_logs_entity_type_format" CHECK ("entity_type" IS NULL OR "entity_type" ~ '^[a-z][a-z0-9_]{0,62}$'),
  ADD CONSTRAINT "audit_logs_entity_id_len" CHECK ("entity_id" IS NULL OR char_length("entity_id") BETWEEN 1 AND 100),
  ADD CONSTRAINT "audit_logs_changes_object" CHECK ("changes" IS NULL OR jsonb_typeof("changes") = 'object'),
  ADD CONSTRAINT "audit_logs_metadata_object" CHECK ("metadata" IS NULL OR jsonb_typeof("metadata") = 'object'),
  ADD CONSTRAINT "audit_logs_request_id_len" CHECK ("request_id" IS NULL OR char_length("request_id") <= 100);

-- ─── Append-only enforcement for audit_logs ──────────────────────────────────────────────────
-- Retention purges (docs/architecture/database/business-rules.md §Data lifecycle) must run as an
-- owner-approved maintenance procedure that disables this trigger inside its own transaction.

CREATE FUNCTION "audit_logs_reject_mutation"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_reject_mutation"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_reject_mutation"();
