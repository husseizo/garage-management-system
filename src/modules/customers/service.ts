import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/modules/staff/permissions";
import { auditChanges, maskPhone, recordAudit } from "@/server/audit";
import type { StaffSession } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { pgErrorInfo } from "@/server/db/errors";
import { AppError } from "@/server/errors/app-error";
import { getGarageSettings } from "@/server/garage";
import { checkRateLimit, RATE_LIMITS } from "@/server/rate-limit";

import { buildDisplayName, normalizeEmail, normalizePhone } from "./normalize";
import type { ContactInput, CustomerInput } from "./schemas";

/**
 * Customer service (Phase 1B). Every function receives the authenticated staff session; callers
 * (server actions / pages) obtain it with `assertPermission()`. Permission is re-checked here so
 * the service is safe to call from anywhere. Every mutation writes its audit row in the same
 * transaction. Error `publicMessage`s are i18n keys.
 */

export const PAGE_SIZE = 25;
type Tx = Prisma.TransactionClient;

/** Interactive transactions over the Neon WebSocket driver; generous timeout for remote latency. */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

function forbid(): never {
  throw new AppError("FORBIDDEN", "errors.forbidden");
}
function requirePerm(actor: StaffSession, permission: Parameters<typeof can>[1]) {
  if (!can(actor.role, permission)) forbid();
}
function invalid(field: string, key: string): never {
  throw new AppError("VALIDATION_FAILED", "errors.validation", { details: { [field]: [key] } });
}
function notFound(): never {
  throw new AppError("NOT_FOUND", "customers.notFound");
}
async function writeLimit(actor: StaffSession) {
  const r = await checkRateLimit(RATE_LIMITS.staffWrite, actor.id);
  if (!r.allowed) throw new AppError("RATE_LIMITED", "errors.rateLimited");
}

async function phoneRegion(): Promise<string> {
  const { countryCode } = await getGarageSettings();
  if (!countryCode) throw new AppError("SERVICE_UNAVAILABLE", "errors.garageProfileMissing");
  return countryCode;
}

export async function normalizeContactValue(kind: "PHONE" | "EMAIL", value: string, field: string) {
  if (kind === "PHONE") {
    const r = normalizePhone(value, await phoneRegion());
    if (!r.ok) invalid(field, "validation.invalidPhone");
    return r.e164;
  }
  const email = normalizeEmail(value);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    invalid(field, "validation.invalidEmail");
  }
  return email;
}

// ─── duplicate detection (warnings only, owner decision J-01) ─────────────────────────────────

export type DuplicateReason = "phone" | "email" | "name" | "taxId";
export interface DuplicateCandidate {
  id: string;
  displayName: string;
  kind: "INDIVIDUAL" | "COMPANY";
  reasons: DuplicateReason[];
}

export async function findDuplicateCandidates(
  probe: { displayName: string; phoneE164?: string; email?: string; taxId?: string },
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const db = getDb();
  const name = probe.displayName.toLowerCase();
  const rows = await db.$queryRaw<{ id: string; reason: DuplicateReason }[]>`
    SELECT c.id::text AS id, 'phone' AS reason FROM customer_contacts cc JOIN customers c ON c.id = cc.customer_id
      WHERE ${probe.phoneE164 ?? null}::text IS NOT NULL AND cc.kind = 'PHONE'
        AND cc.value_normalised = ${probe.phoneE164 ?? null} AND cc.deleted_at IS NULL AND c.deleted_at IS NULL
    UNION
    SELECT c.id::text, 'email' FROM customer_contacts cc JOIN customers c ON c.id = cc.customer_id
      WHERE ${probe.email ?? null}::text IS NOT NULL AND cc.kind = 'EMAIL'
        AND cc.value_normalised = ${probe.email ?? null} AND cc.deleted_at IS NULL AND c.deleted_at IS NULL
    UNION
    SELECT c.id::text, 'taxId' FROM customers c
      WHERE ${probe.taxId ?? null}::text IS NOT NULL AND c.tax_id = ${probe.taxId ?? null} AND c.deleted_at IS NULL
    UNION
    SELECT c.id::text, 'name' FROM customers c
      WHERE c.deleted_at IS NULL AND similarity(c.search_name, ${name}) >= 0.6
    LIMIT 50`;
  const byId = new Map<string, Set<DuplicateReason>>();
  for (const r of rows) {
    if (r.id === excludeId) continue;
    (byId.get(r.id) ?? byId.set(r.id, new Set()).get(r.id)!).add(r.reason);
  }
  if (byId.size === 0) return [];
  const customers = await db.customer.findMany({
    where: { id: { in: [...byId.keys()] } },
    select: { id: true, displayName: true, kind: true },
    take: 10,
  });
  return customers.map((c) => ({ ...c, reasons: [...byId.get(c.id)!] }));
}

// ─── create / update / archive ────────────────────────────────────────────────────────────────

const CUSTOMER_AUDIT_POLICY = {
  kind: "value",
  displayName: "changed-only",
  taxId: "changed-only",
  preferredLanguage: "value",
  notes: "changed-only",
} as const;

export type CreateCustomerResult =
  { status: "created"; id: string } | { status: "duplicates"; candidates: DuplicateCandidate[] };

export async function createCustomer(
  actor: StaffSession,
  input: CustomerInput,
): Promise<CreateCustomerResult> {
  requirePerm(actor, "customer.create");
  await writeLimit(actor);

  const phoneE164 = input.phone
    ? await normalizeContactValue("PHONE", input.phone, "phone")
    : undefined;
  const email = input.email
    ? await normalizeContactValue("EMAIL", input.email, "email")
    : undefined;
  const displayName = buildDisplayName(
    input.kind === "COMPANY"
      ? { kind: "COMPANY", companyName: input.companyName }
      : { kind: "INDIVIDUAL", givenName: input.givenName, familyName: input.familyName },
  );
  const taxId = input.kind === "COMPANY" ? input.taxId : undefined;

  if (!input.confirmDuplicates) {
    const candidates = await findDuplicateCandidates({ displayName, phoneE164, email, taxId });
    if (candidates.length) return { status: "duplicates", candidates };
  }

  const db = getDb();
  const id = await db.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        kind: input.kind,
        givenName: input.kind === "INDIVIDUAL" ? (input.givenName ?? null) : null,
        familyName: input.kind === "INDIVIDUAL" ? (input.familyName ?? null) : null,
        companyName: input.kind === "COMPANY" ? input.companyName : null,
        taxId: taxId ?? null,
        displayName,
        searchName: displayName.toLowerCase(),
        preferredLanguage: input.preferredLanguage,
        notes: input.notes ?? null,
        createdByStaffUserId: actor.id,
      },
    });
    await recordAudit(tx, actor, {
      action: "customer.created",
      entityType: "customers",
      entityId: customer.id,
      subjectCustomerId: customer.id,
      changes: auditChanges(null, customer, CUSTOMER_AUDIT_POLICY),
    });
    const person = input.contactPerson ?? null;
    if (phoneE164) {
      await insertContact(tx, actor, customer.id, {
        kind: "PHONE",
        raw: input.phone!,
        normalised: phoneE164,
        label: input.phoneLabel ?? null,
        person,
        isPrimary: true,
      });
    }
    if (email) {
      await insertContact(tx, actor, customer.id, {
        kind: "EMAIL",
        raw: input.email!,
        normalised: email,
        label: null,
        person,
        isPrimary: true,
      });
    }
    return customer.id;
  }, TX_OPTIONS);
  return { status: "created", id };
}

export async function updateCustomer(
  actor: StaffSession,
  id: string,
  expectedUpdatedAt: string,
  input: CustomerInput,
): Promise<void> {
  requirePerm(actor, "customer.update");
  await writeLimit(actor);
  const db = getDb();
  await db.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) notFound();
    if (before.deletedAt) throw new AppError("CONFLICT", "customers.archivedNotice");
    if (before.kind !== input.kind) invalid("kind", "validation.required");
    const displayName = buildDisplayName(
      input.kind === "COMPANY"
        ? { kind: "COMPANY", companyName: input.companyName }
        : { kind: "INDIVIDUAL", givenName: input.givenName, familyName: input.familyName },
    );
    const data = {
      givenName: input.kind === "INDIVIDUAL" ? (input.givenName ?? null) : null,
      familyName: input.kind === "INDIVIDUAL" ? (input.familyName ?? null) : null,
      companyName: input.kind === "COMPANY" ? input.companyName : null,
      taxId: input.kind === "COMPANY" ? (input.taxId ?? null) : null,
      displayName,
      searchName: displayName.toLowerCase(),
      preferredLanguage: input.preferredLanguage,
      notes: input.notes ?? null,
    };
    const { count } = await tx.customer.updateMany({
      where: { id, updatedAt: new Date(expectedUpdatedAt) },
      data,
    });
    if (count === 0) throw new AppError("CONFLICT", "customers.staleEdit");
    const changes = auditChanges(before, { ...before, ...data }, CUSTOMER_AUDIT_POLICY);
    await recordAudit(tx, actor, {
      action: "customer.updated",
      entityType: "customers",
      entityId: id,
      subjectCustomerId: id,
      changes,
    });
  }, TX_OPTIONS);
}

export async function setCustomerArchived(actor: StaffSession, id: string, archived: boolean) {
  requirePerm(actor, "customer.archive");
  await writeLimit(actor);
  await getDb().$transaction(async (tx) => {
    const c = await tx.customer.findUnique({ where: { id } });
    if (!c) notFound();
    if (archived) {
      if (c.deletedAt) return;
      const owning = await tx.vehicleOwnership.count({
        where: { customerId: id, role: "OWNER", endedAt: null },
      });
      if (owning > 0) throw new AppError("CONFLICT", "customers.archiveBlocked");
    } else if (!c.deletedAt) return;
    await tx.customer.update({ where: { id }, data: { deletedAt: archived ? new Date() : null } });
    await recordAudit(tx, actor, {
      action: archived ? "customer.archived" : "customer.restored",
      entityType: "customers",
      entityId: id,
      subjectCustomerId: id,
    });
  }, TX_OPTIONS);
}

// ─── contacts ─────────────────────────────────────────────────────────────────────────────────

async function insertContact(
  tx: Tx,
  actor: StaffSession,
  customerId: string,
  c: {
    kind: "PHONE" | "EMAIL";
    raw: string;
    normalised: string;
    label: string | null;
    person: string | null;
    isPrimary: boolean;
  },
) {
  const existingPrimary = await tx.customerContact.findFirst({
    where: { customerId, kind: c.kind, isPrimary: true, deletedAt: null },
    select: { id: true },
  });
  const makePrimary = c.isPrimary || !existingPrimary;
  if (makePrimary && existingPrimary) {
    await tx.customerContact.update({
      where: { id: existingPrimary.id },
      data: { isPrimary: false },
    });
  }
  const contact = await tx.customerContact.create({
    data: {
      customerId,
      kind: c.kind,
      valueRaw: c.raw,
      valueNormalised: c.normalised,
      label: c.label,
      contactPersonName: c.person,
      isPrimary: makePrimary,
    },
  });
  await recordAudit(tx, actor, {
    action: "customer.contact_added",
    entityType: "customer_contacts",
    entityId: contact.id,
    subjectCustomerId: customerId,
    changes: auditChanges(null, contact, {
      kind: "value",
      valueNormalised: c.kind === "PHONE" ? "mask-phone" : "mask-email",
      isPrimary: "value",
    }),
  });
  return contact;
}

/** How many OTHER active customers share this normalised value (shared numbers are allowed). */
async function sharedCount(kind: "PHONE" | "EMAIL", value: string, customerId: string) {
  return getDb().customerContact.count({
    where: {
      kind,
      valueNormalised: value,
      deletedAt: null,
      customerId: { not: customerId },
      customer: { deletedAt: null },
    },
  });
}

export async function addContact(actor: StaffSession, customerId: string, input: ContactInput) {
  requirePerm(actor, "customer.contacts.manage");
  await writeLimit(actor);
  const normalised = await normalizeContactValue(input.kind, input.value, "value");
  try {
    await getDb().$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) notFound();
      if (customer.deletedAt) throw new AppError("CONFLICT", "customers.archivedNotice");
      await insertContact(tx, actor, customerId, {
        kind: input.kind,
        raw: input.value,
        normalised,
        label: input.label ?? null,
        person: input.contactPersonName ?? null,
        isPrimary: input.isPrimary,
      });
    }, TX_OPTIONS);
  } catch (error) {
    if (pgErrorInfo(error).constraint === "customer_contacts_no_duplicate") {
      invalid("value", "validation.contactDuplicate");
    }
    throw error;
  }
  return { sharedWith: await sharedCount(input.kind, normalised, customerId) };
}

export async function removeContact(actor: StaffSession, customerId: string, contactId: string) {
  requirePerm(actor, "customer.contacts.manage");
  await writeLimit(actor);
  await getDb().$transaction(async (tx) => {
    const contact = await tx.customerContact.findFirst({
      where: { id: contactId, customerId, deletedAt: null },
    });
    if (!contact) notFound();
    await tx.customerContact.update({
      where: { id: contactId },
      data: { deletedAt: new Date(), isPrimary: false },
    });
    if (contact.isPrimary) {
      const next = await tx.customerContact.findFirst({
        where: { customerId, kind: contact.kind, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      if (next)
        await tx.customerContact.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await recordAudit(tx, actor, {
      action: "customer.contact_removed",
      entityType: "customer_contacts",
      entityId: contactId,
      subjectCustomerId: customerId,
      changes: {
        valueNormalised: {
          from: contact.kind === "PHONE" ? maskPhone(contact.valueNormalised) : "•••",
          to: null,
        },
      },
    });
  }, TX_OPTIONS);
}

export async function setPrimaryContact(
  actor: StaffSession,
  customerId: string,
  contactId: string,
) {
  requirePerm(actor, "customer.contacts.manage");
  await writeLimit(actor);
  await getDb().$transaction(async (tx) => {
    const contact = await tx.customerContact.findFirst({
      where: { id: contactId, customerId, deletedAt: null },
    });
    if (!contact) notFound();
    if (contact.isPrimary) return;
    await tx.customerContact.updateMany({
      where: { customerId, kind: contact.kind, isPrimary: true, deletedAt: null },
      data: { isPrimary: false },
    });
    await tx.customerContact.update({ where: { id: contactId }, data: { isPrimary: true } });
    await recordAudit(tx, actor, {
      action: "customer.contact_primary_set",
      entityType: "customer_contacts",
      entityId: contactId,
      subjectCustomerId: customerId,
      metadata: { kind: contact.kind },
    });
  }, TX_OPTIONS);
}

// ─── queries ──────────────────────────────────────────────────────────────────────────────────

export interface CustomerListItem {
  id: string;
  kind: "INDIVIDUAL" | "COMPANY";
  displayName: string;
  /** null when the viewer may not read contacts, or when none is recorded. */
  primaryPhone: string | null;
  vehicleCount: number;
  createdAt: Date;
  archived: boolean;
}

/** Ids of customers matching `q`, best first. Phone/email matching only for contact readers. */
async function searchCustomerIds(
  actor: StaffSession,
  q: string,
  opts: { archived: boolean; kind?: "INDIVIDUAL" | "COMPANY"; limit: number; offset: number },
): Promise<string[]> {
  const db = getDb();
  const term = q.toLowerCase();
  const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const canContacts = can(actor.role, "customer.contacts.read");
  let phone: string | null = null;
  const digits = q.replace(/\D/g, "");
  if (canContacts && digits.length >= 6) {
    const { countryCode } = await getGarageSettings();
    const r = countryCode ? normalizePhone(q, countryCode) : { ok: false as const };
    phone = r.ok ? r.e164 : null;
  }
  const digitsLike = canContacts && digits.length >= 4 ? `%${digits}%` : null;
  const emailLike = canContacts && q.includes("@") ? like : null;
  const taxId = q.toUpperCase().replace(/[\s.\-/]/g, "");
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT c.id::text AS id
    FROM customers c
    WHERE (${opts.archived} OR c.deleted_at IS NULL)
      AND (${opts.kind ?? null}::text IS NULL OR c.kind::text = ${opts.kind ?? null})
      AND (
        c.search_name LIKE ${like}
        OR similarity(c.search_name, ${term}) >= 0.3
        OR (c.tax_id IS NOT NULL AND c.tax_id = ${taxId})
        OR EXISTS (
          SELECT 1 FROM customer_contacts cc
          WHERE cc.customer_id = c.id AND cc.deleted_at IS NULL AND (
            (${phone}::text IS NOT NULL AND cc.kind = 'PHONE' AND cc.value_normalised = ${phone})
            OR (${digitsLike}::text IS NOT NULL AND cc.kind = 'PHONE' AND cc.value_normalised LIKE ${digitsLike})
            OR (${emailLike}::text IS NOT NULL AND cc.kind = 'EMAIL' AND cc.value_normalised LIKE ${emailLike})
          )
        )
      )
    ORDER BY (c.search_name LIKE ${`${term}%`}) DESC, similarity(c.search_name, ${term}) DESC, c.created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}`;
  return rows.map((r) => r.id);
}

export async function listCustomers(
  actor: StaffSession,
  params: { q: string; kind?: "INDIVIDUAL" | "COMPANY"; archived: boolean; page: number },
): Promise<{ items: CustomerListItem[]; hasMore: boolean }> {
  requirePerm(actor, "customer.read");
  const db = getDb();
  const offset = (params.page - 1) * PAGE_SIZE;
  const canContacts = can(actor.role, "customer.contacts.read");

  let ids: string[] | undefined;
  if (params.q.length >= 2) {
    const r = await checkRateLimit(RATE_LIMITS.staffSearch, actor.id);
    if (!r.allowed) throw new AppError("RATE_LIMITED", "errors.rateLimited");
    ids = await searchCustomerIds(actor, params.q, {
      archived: params.archived,
      kind: params.kind,
      limit: PAGE_SIZE + 1,
      offset,
    });
  }
  const rows = await db.customer.findMany({
    where: ids
      ? { id: { in: ids } }
      : {
          ...(params.archived ? {} : { deletedAt: null }),
          ...(params.kind ? { kind: params.kind } : {}),
        },
    orderBy: { createdAt: "desc" },
    ...(ids ? {} : { skip: offset, take: PAGE_SIZE + 1 }),
    select: {
      id: true,
      kind: true,
      displayName: true,
      createdAt: true,
      deletedAt: true,
      contacts: canContacts
        ? {
            where: { kind: "PHONE", isPrimary: true, deletedAt: null },
            select: { valueNormalised: true },
          }
        : false,
      _count: { select: { ownerships: { where: { endedAt: null } } } },
    },
  });
  const ordered = ids ? ids.map((id) => rows.find((r) => r.id === id)).filter((r) => !!r) : rows;
  return {
    hasMore: ordered.length > PAGE_SIZE,
    items: ordered.slice(0, PAGE_SIZE).map((r) => ({
      id: r.id,
      kind: r.kind,
      displayName: r.displayName,
      primaryPhone:
        canContacts && "contacts" in r && r.contacts
          ? (r.contacts[0]?.valueNormalised ?? null)
          : null,
      vehicleCount: r._count.ownerships,
      createdAt: r.createdAt,
      archived: !!r.deletedAt,
    })),
  };
}

export interface CustomerDetail {
  id: string;
  kind: "INDIVIDUAL" | "COMPANY";
  givenName: string | null;
  familyName: string | null;
  companyName: string | null;
  taxId: string | null;
  displayName: string;
  preferredLanguage: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string;
  archived: boolean;
  /** null when the viewer may not read contacts. */
  contacts:
    | {
        id: string;
        kind: "PHONE" | "EMAIL";
        value: string;
        label: string | null;
        contactPersonName: string | null;
        isPrimary: boolean;
        sharedWith: number;
      }[]
    | null;
  vehicles: {
    ownershipId: string;
    vehicleId: string;
    role: "OWNER" | "KEEPER";
    make: string;
    model: string | null;
    modelYear: number | null;
    plate: string | null;
    startedAt: Date;
    endedAt: Date | null;
  }[];
}

export async function getCustomerDetail(actor: StaffSession, id: string): Promise<CustomerDetail> {
  requirePerm(actor, "customer.read");
  const canContacts = can(actor.role, "customer.contacts.read");
  const db = getDb();
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      contacts: canContacts
        ? {
            where: { deletedAt: null },
            orderBy: [{ kind: "asc" }, { isPrimary: "desc" }, { createdAt: "asc" }],
          }
        : false,
      ownerships: {
        orderBy: { startedAt: "desc" },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              modelYear: true,
              registrations: { orderBy: { validFrom: "desc" } },
            },
          },
        },
      },
    },
  });
  if (!c) notFound();

  let contacts: CustomerDetail["contacts"] = null;
  if (canContacts && "contacts" in c && Array.isArray(c.contacts)) {
    const values = c.contacts.map((x) => x.valueNormalised);
    const shared = values.length
      ? await db.customerContact.groupBy({
          by: ["kind", "valueNormalised"],
          where: {
            valueNormalised: { in: values },
            deletedAt: null,
            customerId: { not: id },
            customer: { deletedAt: null },
          },
          _count: { _all: true },
        })
      : [];
    contacts = c.contacts.map((x) => ({
      id: x.id,
      kind: x.kind,
      value: x.valueNormalised,
      label: x.label,
      contactPersonName: x.contactPersonName,
      isPrimary: x.isPrimary,
      sharedWith:
        shared.find((s) => s.kind === x.kind && s.valueNormalised === x.valueNormalised)?._count
          ._all ?? 0,
    }));
  }

  return {
    id: c.id,
    kind: c.kind,
    givenName: c.givenName,
    familyName: c.familyName,
    companyName: c.companyName,
    taxId: c.taxId,
    displayName: c.displayName,
    preferredLanguage: c.preferredLanguage,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    createdByName: c.createdBy.name,
    archived: !!c.deletedAt,
    contacts,
    // Only this customer's own periods; later owners are never joined in (BR-05).
    vehicles: c.ownerships.map((o) => {
      const at = o.endedAt ?? new Date();
      const reg =
        o.vehicle.registrations.find((r) => r.validFrom <= at && (!r.validTo || r.validTo >= at)) ??
        o.vehicle.registrations[0];
      return {
        ownershipId: o.id,
        vehicleId: o.vehicle.id,
        role: o.role,
        make: o.vehicle.make,
        model: o.vehicle.model,
        modelYear: o.vehicle.modelYear,
        plate: reg?.plateRaw ?? null,
        startedAt: o.startedAt,
        endedAt: o.endedAt,
      };
    }),
  };
}

/** Typeahead for owner/keeper pickers: active customers only, names (+ masked phone) only. */
export async function searchCustomersForPicker(actor: StaffSession, q: string) {
  requirePerm(actor, "customer.read");
  if (q.trim().length < 2) return [];
  const r = await checkRateLimit(RATE_LIMITS.staffSearch, actor.id);
  if (!r.allowed) throw new AppError("RATE_LIMITED", "errors.rateLimited");
  const ids = await searchCustomerIds(actor, q.trim(), { archived: false, limit: 8, offset: 0 });
  if (!ids.length) return [];
  const canContacts = can(actor.role, "customer.contacts.read");
  const rows = await getDb().customer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      displayName: true,
      kind: true,
      contacts: canContacts
        ? {
            where: { kind: "PHONE", isPrimary: true, deletedAt: null },
            select: { valueNormalised: true },
          }
        : false,
    },
  });
  return ids
    .map((id) => rows.find((x) => x.id === id))
    .filter((x) => !!x)
    .map((x) => ({
      id: x.id,
      displayName: x.displayName,
      kind: x.kind,
      hint:
        canContacts && "contacts" in x && x.contacts
          ? maskPhone(x.contacts[0]?.valueNormalised)
          : null,
    }));
}
