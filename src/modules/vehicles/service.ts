import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { TX_OPTIONS } from "@/modules/customers/service";
import { can } from "@/modules/staff/permissions";
import { auditChanges, recordAudit } from "@/server/audit";
import type { StaffSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { pgErrorInfo } from "@/server/db/errors";
import { AppError } from "@/server/errors/app-error";
import { effectiveInstant } from "@/lib/dates";
import { getGarageSettings } from "@/server/garage";
import { checkRateLimit, RATE_LIMITS } from "@/server/rate-limit";

import { normalizePlate, normalizeVin, vehicleSearchText } from "./normalize";
import type { NewVehicleInput, VehicleInput } from "./schemas";

/**
 * Vehicle service (Phase 1B): vehicles, registration (plate) history and ownership history.
 *
 * Concurrency: registration and ownership changes lock the vehicle row (`SELECT … FOR UPDATE`)
 * and check the expected current state, so two staff members cannot transfer the same vehicle at
 * once. Database exclusion constraints are the final guarantee (one current plate per vehicle, one
 * vehicle per plate at a time, one OWNER at a time).
 */
type Tx = Prisma.TransactionClient;
export type VehicleWarning = "vinCheckDigit" | "plateUnusualFormat";
export const PAGE_SIZE = 25;
/** Tolerated clock skew for "effective now" dates from the browser. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function requirePerm(actor: StaffSession, permission: Parameters<typeof can>[1]) {
  if (!can(actor.role, permission)) throw new AppError("FORBIDDEN", "errors.forbidden");
}
function invalid(field: string, key: string): never {
  throw new AppError("VALIDATION_FAILED", "errors.validation", { details: { [field]: [key] } });
}
function notFound(): never {
  throw new AppError("NOT_FOUND", "vehicles.notFound");
}
async function writeLimit(actor: StaffSession) {
  const r = await checkRateLimit(RATE_LIMITS.staffWrite, actor.id);
  if (!r.allowed) throw new AppError("RATE_LIMITED", "errors.rateLimited");
}

function mapConstraint(error: unknown): never {
  const { constraint } = pgErrorInfo(error);
  if (constraint === "vehicles_vin_unique_active") invalid("vin", "validation.vinInUse");
  if (constraint === "vehicle_registrations_plate_no_overlap")
    invalid("plate", "validation.plateInUse");
  if (constraint === "vehicle_ownerships_one_owner")
    throw new AppError("CONFLICT", "validation.ownerConflict");
  if (constraint === "vehicle_ownerships_keeper_no_overlap")
    invalid("customerId", "validation.contactDuplicate");
  throw error;
}

function parseVin(raw: string | undefined, warnings: VehicleWarning[]) {
  if (!raw) return { vinRaw: null, vinNormalised: null };
  const r = normalizeVin(raw);
  if (!r.ok) invalid("vin", "validation.invalidVin");
  if (!r.checkDigitValid) warnings.push("vinCheckDigit");
  return { vinRaw: raw, vinNormalised: r.vin };
}

async function parsePlate(raw: string, warnings: VehicleWarning[]) {
  const { countryCode } = await getGarageSettings();
  const country = countryCode ?? "TZ";
  const r = normalizePlate(raw, country);
  if (!r.ok) invalid("plate", "validation.invalidPlate");
  if (!r.matchesUsualFormat) warnings.push("plateUnusualFormat"); // warning only (J-03)
  return { countryCode: country, plateRaw: raw.toUpperCase(), plateNormalised: r.plate };
}

async function effectiveDate(
  ymd: string | undefined,
  notBefore: Date | null,
  field = "effectiveAt",
): Promise<Date> {
  const { timezone } = await getGarageSettings();
  const when = effectiveInstant(ymd, timezone);
  if (when.getTime() > Date.now() + FUTURE_SKEW_MS) invalid(field, "validation.dateInFuture");
  if (notBefore && when.getTime() <= notBefore.getTime()) invalid(field, "validation.dateTooEarly");
  return when;
}

async function lockVehicle(tx: Tx, vehicleId: string) {
  const rows = await tx.$queryRaw<{ id: string; deleted_at: Date | null }[]>`
    SELECT id::text, deleted_at FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE`;
  const v = rows[0];
  if (!v) notFound();
  if (v.deleted_at) throw new AppError("CONFLICT", "vehicles.archivedNotice");
}

async function activeCustomer(tx: Tx, customerId: string, field: string) {
  const c = await tx.customer.findUnique({
    where: { id: customerId },
    select: { id: true, deletedAt: true },
  });
  if (!c) invalid(field, "validation.customerRequired");
  if (c.deletedAt) invalid(field, "validation.customerArchived");
  return c;
}

const VEHICLE_AUDIT_POLICY = {
  vinNormalised: "value",
  chassisNumber: "value",
  make: "value",
  model: "value",
  modelYear: "value",
  fuelType: "value",
  colour: "value",
  engineNumber: "value",
} as const;

function vehicleData(
  input: VehicleInput,
  vin: { vinRaw: string | null; vinNormalised: string | null },
) {
  return {
    ...vin,
    chassisNumber: input.chassisNumber ?? null,
    make: input.make,
    model: input.model ?? null,
    modelYear: input.modelYear ?? null,
    fuelType: input.fuelType ?? null,
    colour: input.colour ?? null,
    engineNumber: input.engineNumber ?? null,
    searchText: vehicleSearchText(input.make, input.model),
  };
}

// ─── create / update / archive ────────────────────────────────────────────────────────────────

export async function createVehicle(
  actor: StaffSession,
  input: NewVehicleInput,
): Promise<{ id: string; warnings: VehicleWarning[] }> {
  requirePerm(actor, "vehicle.create");
  if (input.ownerCustomerId) requirePerm(actor, "vehicle.ownership.transfer");
  await writeLimit(actor);
  const warnings: VehicleWarning[] = [];
  const vin = parseVin(input.vin, warnings);
  const plate = input.plate ? await parsePlate(input.plate, warnings) : null;
  try {
    const id = await getDb().$transaction(async (tx) => {
      if (input.ownerCustomerId) await activeCustomer(tx, input.ownerCustomerId, "ownerCustomerId");
      const vehicle = await tx.vehicle.create({
        data: { ...vehicleData(input, vin), createdByStaffUserId: actor.id },
      });
      await recordAudit(tx, actor, {
        action: "vehicle.created",
        entityType: "vehicles",
        entityId: vehicle.id,
        subjectVehicleId: vehicle.id,
        changes: auditChanges(null, vehicle, VEHICLE_AUDIT_POLICY),
      });
      const now = new Date();
      if (plate) {
        const reg = await tx.vehicleRegistration.create({
          data: {
            vehicleId: vehicle.id,
            ...plate,
            validFrom: now,
            recordedByStaffUserId: actor.id,
          },
        });
        await recordAudit(tx, actor, {
          action: "vehicle.registration_changed",
          entityType: "vehicle_registrations",
          entityId: reg.id,
          subjectVehicleId: vehicle.id,
          changes: { plate: { from: null, to: reg.plateNormalised } },
        });
      }
      if (input.ownerCustomerId) {
        const own = await tx.vehicleOwnership.create({
          data: {
            vehicleId: vehicle.id,
            customerId: input.ownerCustomerId,
            role: "OWNER",
            startedAt: now,
            source: "REGISTRATION",
            recordedByStaffUserId: actor.id,
          },
        });
        await recordAudit(tx, actor, {
          action: "vehicle.ownership_set",
          entityType: "vehicle_ownerships",
          entityId: own.id,
          subjectVehicleId: vehicle.id,
          subjectCustomerId: input.ownerCustomerId,
        });
      }
      return vehicle.id;
    }, TX_OPTIONS);
    return { id, warnings };
  } catch (error) {
    mapConstraint(error);
  }
}

export async function updateVehicle(
  actor: StaffSession,
  id: string,
  expectedUpdatedAt: string,
  input: VehicleInput,
): Promise<{ warnings: VehicleWarning[] }> {
  requirePerm(actor, "vehicle.update");
  await writeLimit(actor);
  const warnings: VehicleWarning[] = [];
  const vin = parseVin(input.vin, warnings);
  try {
    await getDb().$transaction(async (tx) => {
      const before = await tx.vehicle.findUnique({ where: { id } });
      if (!before) notFound();
      if (before.deletedAt) throw new AppError("CONFLICT", "vehicles.archivedNotice");
      const data = vehicleData(input, vin);
      const { count } = await tx.vehicle.updateMany({
        where: { id, updatedAt: new Date(expectedUpdatedAt) },
        data,
      });
      if (count === 0) throw new AppError("CONFLICT", "vehicles.staleEdit");
      await recordAudit(tx, actor, {
        action: "vehicle.updated",
        entityType: "vehicles",
        entityId: id,
        subjectVehicleId: id,
        changes: auditChanges(before, { ...before, ...data }, VEHICLE_AUDIT_POLICY),
      });
    }, TX_OPTIONS);
  } catch (error) {
    mapConstraint(error);
  }
  return { warnings };
}

/** Archive (e.g. scrapped/exported): ends the current registration and ownerships at that moment. */
export async function archiveVehicle(actor: StaffSession, id: string) {
  requirePerm(actor, "vehicle.archive");
  await writeLimit(actor);
  await getDb().$transaction(async (tx) => {
    await lockVehicle(tx, id);
    const now = new Date();
    await tx.vehicleRegistration.updateMany({
      where: { vehicleId: id, validTo: null },
      data: { validTo: now },
    });
    const open = await tx.vehicleOwnership.findMany({ where: { vehicleId: id, endedAt: null } });
    await tx.vehicleOwnership.updateMany({
      where: { vehicleId: id, endedAt: null },
      data: { endedAt: now },
    });
    await tx.vehicle.update({ where: { id }, data: { deletedAt: now } });
    await recordAudit(tx, actor, {
      action: "vehicle.archived",
      entityType: "vehicles",
      entityId: id,
      subjectVehicleId: id,
    });
    for (const o of open) {
      await recordAudit(tx, actor, {
        action: "vehicle.archived",
        entityType: "vehicles",
        entityId: id,
        subjectCustomerId: o.customerId,
      });
    }
  }, TX_OPTIONS);
}

// ─── registration history ─────────────────────────────────────────────────────────────────────

export async function changeRegistration(
  actor: StaffSession,
  vehicleId: string,
  plateInput: string,
  effectiveAt?: string,
): Promise<{ warnings: VehicleWarning[] }> {
  requirePerm(actor, "vehicle.registration.change");
  await writeLimit(actor);
  const warnings: VehicleWarning[] = [];
  const plate = await parsePlate(plateInput, warnings);
  try {
    await getDb().$transaction(async (tx) => {
      await lockVehicle(tx, vehicleId);
      const current = await tx.vehicleRegistration.findFirst({
        where: { vehicleId, validTo: null },
      });
      if (
        current?.plateNormalised === plate.plateNormalised &&
        current.countryCode === plate.countryCode
      ) {
        return; // unchanged
      }
      const at = await effectiveDate(effectiveAt, current?.validFrom ?? null);
      if (current) {
        await tx.vehicleRegistration.update({ where: { id: current.id }, data: { validTo: at } });
      }
      const reg = await tx.vehicleRegistration.create({
        data: { vehicleId, ...plate, validFrom: at, recordedByStaffUserId: actor.id },
      });
      await recordAudit(tx, actor, {
        action: "vehicle.registration_changed",
        entityType: "vehicle_registrations",
        entityId: reg.id,
        subjectVehicleId: vehicleId,
        changes: { plate: { from: current?.plateNormalised ?? null, to: reg.plateNormalised } },
      });
    }, TX_OPTIONS);
  } catch (error) {
    mapConstraint(error);
  }
  return { warnings };
}

// ─── ownership history (BR-05) ────────────────────────────────────────────────────────────────

export async function transferOwnership(
  actor: StaffSession,
  vehicleId: string,
  input: {
    toCustomerId: string;
    expectedOwnershipId: string | null;
    effectiveAt?: string;
    reason: "TRANSFER" | "CORRECTION";
  },
) {
  requirePerm(actor, "vehicle.ownership.transfer");
  await writeLimit(actor);
  try {
    await getDb().$transaction(async (tx) => {
      await lockVehicle(tx, vehicleId);
      const current = await tx.vehicleOwnership.findFirst({
        where: { vehicleId, role: "OWNER", endedAt: null },
      });
      // Optimistic check: the form must have been rendered against the current owner.
      if ((current?.id ?? null) !== input.expectedOwnershipId) {
        throw new AppError("CONFLICT", "validation.ownerConflict");
      }
      if (current?.customerId === input.toCustomerId)
        invalid("toCustomerId", "vehicles.ownership.sameOwner");
      await activeCustomer(tx, input.toCustomerId, "toCustomerId");
      const at = await effectiveDate(input.effectiveAt, current?.startedAt ?? null);

      if (current) {
        await tx.vehicleOwnership.update({ where: { id: current.id }, data: { endedAt: at } });
        // Keepers were linked to the previous owner's use of the vehicle; end them too.
        const keepers = await tx.vehicleOwnership.findMany({
          where: { vehicleId, role: "KEEPER", endedAt: null },
        });
        for (const k of keepers) {
          await tx.vehicleOwnership.update({
            where: { id: k.id },
            data: { endedAt: k.startedAt < at ? at : new Date(k.startedAt.getTime() + 1) },
          });
          await recordAudit(tx, actor, {
            action: "vehicle.keeper_ended",
            entityType: "vehicle_ownerships",
            entityId: k.id,
            subjectVehicleId: vehicleId,
            subjectCustomerId: k.customerId,
          });
        }
      }
      const next = await tx.vehicleOwnership.create({
        data: {
          vehicleId,
          customerId: input.toCustomerId,
          role: "OWNER",
          startedAt: at,
          source: current ? input.reason : "REGISTRATION",
          recordedByStaffUserId: actor.id,
        },
      });
      const action = current ? "vehicle.ownership_transferred" : "vehicle.ownership_set";
      // One row per timeline. Neither row names the other customer (privacy, BR-05).
      await recordAudit(tx, actor, {
        action,
        entityType: "vehicle_ownerships",
        entityId: next.id,
        subjectVehicleId: vehicleId,
        metadata: { reason: input.reason },
      });
      await recordAudit(tx, actor, {
        action,
        entityType: "vehicle_ownerships",
        entityId: next.id,
        subjectCustomerId: input.toCustomerId,
      });
      if (current) {
        await recordAudit(tx, actor, {
          action,
          entityType: "vehicle_ownerships",
          entityId: current.id,
          subjectCustomerId: current.customerId,
        });
      }
    }, TX_OPTIONS);
  } catch (error) {
    mapConstraint(error);
  }
}

export async function assignKeeper(
  actor: StaffSession,
  vehicleId: string,
  customerId: string,
  effectiveAt?: string,
) {
  requirePerm(actor, "vehicle.ownership.transfer");
  await writeLimit(actor);
  try {
    await getDb().$transaction(async (tx) => {
      await lockVehicle(tx, vehicleId);
      await activeCustomer(tx, customerId, "customerId");
      const at = await effectiveDate(effectiveAt, null);
      const k = await tx.vehicleOwnership.create({
        data: {
          vehicleId,
          customerId,
          role: "KEEPER",
          startedAt: at,
          source: "REGISTRATION",
          recordedByStaffUserId: actor.id,
        },
      });
      await recordAudit(tx, actor, {
        action: "vehicle.keeper_assigned",
        entityType: "vehicle_ownerships",
        entityId: k.id,
        subjectVehicleId: vehicleId,
        subjectCustomerId: customerId,
      });
    }, TX_OPTIONS);
  } catch (error) {
    mapConstraint(error);
  }
}

export async function endKeeper(actor: StaffSession, vehicleId: string, ownershipId: string) {
  requirePerm(actor, "vehicle.ownership.transfer");
  await writeLimit(actor);
  await getDb().$transaction(async (tx) => {
    await lockVehicle(tx, vehicleId);
    const k = await tx.vehicleOwnership.findFirst({
      where: { id: ownershipId, vehicleId, role: "KEEPER", endedAt: null },
    });
    if (!k) notFound();
    const now = new Date();
    await tx.vehicleOwnership.update({
      where: { id: k.id },
      data: { endedAt: now > k.startedAt ? now : new Date(k.startedAt.getTime() + 1) },
    });
    await recordAudit(tx, actor, {
      action: "vehicle.keeper_ended",
      entityType: "vehicle_ownerships",
      entityId: k.id,
      subjectVehicleId: vehicleId,
      subjectCustomerId: k.customerId,
    });
  }, TX_OPTIONS);
}

// ─── queries ──────────────────────────────────────────────────────────────────────────────────

export interface VehicleListItem {
  id: string;
  plate: string | null;
  make: string;
  model: string | null;
  modelYear: number | null;
  vin: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: Date;
  archived: boolean;
}

async function searchVehicleIds(
  q: string,
  opts: { archived: boolean; limit: number; offset: number },
) {
  const term = q.toLowerCase().trim();
  const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const plate = q.toUpperCase().replace(/[\s.\-]/g, "");
  const plateLike = plate.length >= 2 ? `%${plate}%` : null;
  const rows = await getDb().$queryRaw<{ id: string }[]>`
    SELECT v.id::text AS id
    FROM vehicles v
    WHERE (${opts.archived} OR v.deleted_at IS NULL)
      AND (
        v.search_text LIKE ${like}
        OR similarity(v.search_text, ${term}) >= 0.3
        OR (v.vin_normalised IS NOT NULL AND v.vin_normalised LIKE ${`${plate}%`})
        OR (v.chassis_number IS NOT NULL AND upper(v.chassis_number) = ${plate})
        OR EXISTS (
          SELECT 1 FROM vehicle_registrations r
          WHERE r.vehicle_id = v.id AND ${plateLike}::text IS NOT NULL AND r.plate_normalised LIKE ${plateLike}
        )
      )
    ORDER BY
      EXISTS (SELECT 1 FROM vehicle_registrations r WHERE r.vehicle_id = v.id AND r.valid_to IS NULL AND r.plate_normalised = ${plate}) DESC,
      similarity(v.search_text, ${term}) DESC,
      v.created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}`;
  return rows.map((r) => r.id);
}

export async function listVehicles(
  actor: StaffSession,
  params: { q: string; archived: boolean; page: number },
): Promise<{ items: VehicleListItem[]; hasMore: boolean }> {
  requirePerm(actor, "vehicle.read");
  const offset = (params.page - 1) * PAGE_SIZE;
  let ids: string[] | undefined;
  if (params.q.length >= 2) {
    const r = await checkRateLimit(RATE_LIMITS.staffSearch, actor.id);
    if (!r.allowed) throw new AppError("RATE_LIMITED", "errors.rateLimited");
    ids = await searchVehicleIds(params.q, {
      archived: params.archived,
      limit: PAGE_SIZE + 1,
      offset,
    });
  }
  const rows = await getDb().vehicle.findMany({
    where: ids ? { id: { in: ids } } : params.archived ? {} : { deletedAt: null },
    orderBy: { createdAt: "desc" },
    ...(ids ? {} : { skip: offset, take: PAGE_SIZE + 1 }),
    include: {
      registrations: { where: { validTo: null }, take: 1 },
      ownerships: {
        where: { role: "OWNER", endedAt: null },
        take: 1,
        include: { customer: { select: { id: true, displayName: true } } },
      },
    },
  });
  const ordered = ids ? ids.map((id) => rows.find((r) => r.id === id)).filter((r) => !!r) : rows;
  return {
    hasMore: ordered.length > PAGE_SIZE,
    items: ordered.slice(0, PAGE_SIZE).map((v) => ({
      id: v.id,
      plate: v.registrations[0]?.plateRaw ?? null,
      make: v.make,
      model: v.model,
      modelYear: v.modelYear,
      vin: v.vinNormalised,
      ownerId: v.ownerships[0]?.customer.id ?? null,
      ownerName: v.ownerships[0]?.customer.displayName ?? null,
      createdAt: v.createdAt,
      archived: !!v.deletedAt,
    })),
  };
}

export async function getVehicleDetail(actor: StaffSession, id: string) {
  requirePerm(actor, "vehicle.read");
  const v = await getDb().vehicle.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      registrations: { orderBy: { validFrom: "desc" } },
      ownerships: {
        orderBy: [{ startedAt: "desc" }],
        include: {
          customer: { select: { id: true, displayName: true, kind: true, deletedAt: true } },
        },
      },
    },
  });
  if (!v) notFound();
  return {
    id: v.id,
    vinRaw: v.vinRaw,
    vin: v.vinNormalised,
    chassisNumber: v.chassisNumber,
    make: v.make,
    model: v.model,
    modelYear: v.modelYear,
    fuelType: v.fuelType,
    colour: v.colour,
    engineNumber: v.engineNumber,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    createdByName: v.createdBy.name,
    archived: !!v.deletedAt,
    registrations: v.registrations.map((r) => ({
      id: r.id,
      plate: r.plateRaw,
      plateNormalised: r.plateNormalised,
      countryCode: r.countryCode,
      validFrom: r.validFrom,
      validTo: r.validTo,
    })),
    // Staff-only view: names of past owners are shown for dispute handling (J-09); the future
    // customer portal will show service history without previous owners.
    ownerships: v.ownerships.map((o) => ({
      id: o.id,
      role: o.role,
      customerId: o.customer.id,
      customerName: o.customer.displayName,
      customerArchived: !!o.customer.deletedAt,
      startedAt: o.startedAt,
      endedAt: o.endedAt,
      source: o.source,
    })),
  };
}
export type VehicleDetail = Awaited<ReturnType<typeof getVehicleDetail>>;
