import "dotenv/config";

import { Pool, type PoolClient } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Phase 1B schema integrity against the live Neon DEVELOPMENT branch. Every test runs in
 * BEGIN … ROLLBACK (nothing persists). Skipped without a database; refused for production names.
 */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED;
const isProductionBranch = /^(production|prod|main)$/i.test(process.env.NEON_BRANCH ?? "");
const enabled = Boolean(url) && !isProductionBranch;

describe.skipIf(!enabled)("Phase 1B schema (development branch, rolled back)", () => {
  let pool: Pool;
  let staffId: string;

  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });

  /** Self-contained staff fixture (fresh CI branches have no staff accounts). */
  const STAFF_FIXTURE_SQL = `insert into staff_users (id, email, name, password_hash, updated_at)
    values ('it-' || gen_random_uuid(), 'it-' || gen_random_uuid() || '@example.test', 'IT Staff', 'x', now())
    returning id`;
  afterAll(async () => {
    await pool?.end();
  });

  async function inRollback(fn: (c: PoolClient) => Promise<void>) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      staffId = (await c.query<{ id: string }>(STAFF_FIXTURE_SQL)).rows[0]!.id;
      await fn(c);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  }

  async function expectFailure(
    c: PoolClient,
    sql: string,
    params: unknown[],
    code: string,
    constraint?: string,
  ) {
    await c.query("SAVEPOINT s");
    try {
      await c.query(sql, params);
      expect.unreachable(`expected ${code}${constraint ? ` (${constraint})` : ""}`);
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      expect(e.code).toBe(code);
      if (constraint) expect(e.constraint).toBe(constraint);
    } finally {
      await c.query("ROLLBACK TO SAVEPOINT s");
    }
  }

  const customer = async (c: PoolClient, name = "IT Customer") =>
    (
      await c.query<{ id: string }>(
        `insert into customers (kind, given_name, display_name, search_name, created_by_staff_user_id, updated_at)
         values ('INDIVIDUAL', $1, $1, lower($1), $2, now()) returning id::text`,
        [name, staffId],
      )
    ).rows[0]!.id;

  const vehicle = async (c: PoolClient, vin: string | null = null) =>
    (
      await c.query<{ id: string }>(
        `insert into vehicles (vin_raw, vin_normalised, make, search_text, created_by_staff_user_id, updated_at)
         values ($1, $1, 'Toyota', 'toyota', $2, now()) returning id::text`,
        [vin, staffId],
      )
    ).rows[0]!.id;

  const plate = (
    c: PoolClient,
    vehicleId: string,
    p: string,
    from: string,
    to: string | null = null,
  ) =>
    c.query(
      `insert into vehicle_registrations (vehicle_id, country_code, plate_raw, plate_normalised, valid_from, valid_to, recorded_by_staff_user_id)
       values ($1, 'TZ', $2, $2, $3, $4, $5)`,
      [vehicleId, p, from, to, staffId],
    );

  const owner = (
    c: PoolClient,
    vehicleId: string,
    customerId: string,
    from: string,
    to: string | null = null,
    role = "OWNER",
  ) =>
    c.query(
      `insert into vehicle_ownerships (vehicle_id, customer_id, role, started_at, ended_at, source, recorded_by_staff_user_id)
       values ($1, $2, $3, $4, $5, 'REGISTRATION', $6)`,
      [vehicleId, customerId, role, from, to, staffId],
    );

  it("has the Phase 1B migration applied and extensions installed", async () => {
    const m = await pool.query<{ name: string }>(
      "select migration_name name from _prisma_migrations where finished_at is not null order by 1",
    );
    expect(m.rows.map((r) => r.name)).toContain("20261124120000_phase_1b_customers_vehicles");
    const ext = await pool.query<{ extname: string }>(
      "select extname::text from pg_extension where extname in ('pg_trgm','btree_gist') order by 1",
    );
    expect(ext.rows.map((r) => r.extname)).toEqual(["btree_gist", "pg_trgm"]);
  });

  it("customers: enforces name rules per kind, TIN format and search-name consistency", async () => {
    await inRollback(async (c) => {
      const ins = `insert into customers (kind, given_name, company_name, tax_id, display_name, search_name, created_by_staff_user_id, updated_at)
                   values ($1, $2, $3, $4, $5, $6, $7, now())`;
      await expectFailure(
        c,
        ins,
        ["INDIVIDUAL", null, null, null, "X", "x", staffId],
        "23514",
        "customers_kind_names",
      );
      await expectFailure(
        c,
        ins,
        ["COMPANY", null, null, null, "X", "x", staffId],
        "23514",
        "customers_kind_names",
      );
      await expectFailure(
        c,
        ins,
        ["INDIVIDUAL", "Asha", null, "123456789", "Asha", "asha", staffId],
        "23514",
        "customers_kind_names",
      );
      await expectFailure(
        c,
        ins,
        ["COMPANY", null, "Kilimo Ltd", "12-3", "Kilimo Ltd", "kilimo ltd", staffId],
        "23514",
        "customers_tax_id_format",
      );
      await expectFailure(
        c,
        ins,
        ["COMPANY", null, "Kilimo Ltd", null, "Kilimo Ltd", "Kilimo Ltd", staffId],
        "23514",
        "customers_search_name_consistent",
      );
      await c.query(ins, [
        "COMPANY",
        null,
        "Kilimo Ltd",
        null,
        "Kilimo Ltd",
        "kilimo ltd",
        staffId,
      ]);
      await c.query(ins, [
        "COMPANY",
        null,
        "Kilimo Ltd",
        "123456789",
        "Kilimo Ltd",
        "kilimo ltd",
        staffId,
      ]);
    });
  });

  it("contacts: a phone may be shared ACROSS customers but not duplicated within one; one primary per kind", async () => {
    await inRollback(async (c) => {
      const a = await customer(c, "Shared A");
      const b = await customer(c, "Shared B");
      const ins = `insert into customer_contacts (customer_id, kind, value_raw, value_normalised, is_primary, updated_at)
                   values ($1, $2, $3, $3, $4, now())`;
      await c.query(ins, [a, "PHONE", "+255712345678", true]);
      await c.query(ins, [b, "PHONE", "+255712345678", true]); // shared number allowed (D-05)
      await expectFailure(
        c,
        ins,
        [a, "PHONE", "+255712345678", false],
        "23P01",
        "customer_contacts_no_duplicate",
      );
      await expectFailure(
        c,
        ins,
        [a, "PHONE", "+255754000111", true],
        "23P01",
        "customer_contacts_one_primary",
      );
      await c.query(ins, [a, "PHONE", "+255754000111", false]);
      await expectFailure(
        c,
        ins,
        [a, "PHONE", "0712345678", false],
        "23514",
        "customer_contacts_value_format",
      );
      await expectFailure(
        c,
        ins,
        [a, "EMAIL", "Asha@Example.com", false],
        "23514",
        "customer_contacts_value_format",
      );
      // A soft-deleted duplicate no longer blocks re-adding the number.
      await c.query(
        "update customer_contacts set deleted_at = now(), is_primary = false where customer_id = $1 and value_normalised = '+255754000111'",
        [a],
      );
      await c.query(ins, [a, "PHONE", "+255754000111", false]);
    });
  });

  it("vehicles: VIN optional, format-checked, unique among active vehicles", async () => {
    await inRollback(async (c) => {
      await vehicle(c, null);
      await vehicle(c, null); // several vehicles without VIN
      const v1 = await vehicle(c, "1M8GDM9AXKP042788");
      await expectFailure(
        c,
        "insert into vehicles (vin_raw, vin_normalised, make, search_text, created_by_staff_user_id, updated_at) values ($1, $1, 'Toyota', 'toyota', $2, now())",
        ["1M8GDM9AXKP042788", staffId],
        "23P01",
        "vehicles_vin_unique_active",
      );
      await expectFailure(
        c,
        "insert into vehicles (vin_raw, vin_normalised, make, search_text, created_by_staff_user_id, updated_at) values ($1, $1, 'Toyota', 'toyota', $2, now())",
        ["1M8GDM9AXKP04278O", staffId],
        "23514",
        "vehicles_vin_format",
      );
      await c.query("update vehicles set deleted_at = now() where id = $1", [v1]);
      await vehicle(c, "1M8GDM9AXKP042788"); // archived vehicle frees the VIN
    });
  });

  it("registrations: a plate is current on one vehicle at a time; history and later reuse allowed", async () => {
    await inRollback(async (c) => {
      const v1 = await vehicle(c);
      const v2 = await vehicle(c);
      await plate(c, v1, "T123ITA", "2026-01-01T00:00:00Z");
      await expectFailure(
        c,
        `insert into vehicle_registrations (vehicle_id, country_code, plate_raw, plate_normalised, valid_from, recorded_by_staff_user_id) values ($1, 'TZ', 'T123ITA', 'T123ITA', '2026-06-01', $2)`,
        [v2, staffId],
        "23P01",
        "vehicle_registrations_plate_no_overlap",
      );
      // One current plate per vehicle.
      await expectFailure(
        c,
        `insert into vehicle_registrations (vehicle_id, country_code, plate_raw, plate_normalised, valid_from, recorded_by_staff_user_id) values ($1, 'TZ', 'T456ITB', 'T456ITB', '2026-06-01', $2)`,
        [v1, staffId],
        "23P01",
        "vehicle_registrations_vehicle_no_overlap",
      );
      // Close v1's plate, then the plate may move to v2 from that instant (half-open ranges).
      await c.query(
        "update vehicle_registrations set valid_to = '2026-06-01T00:00:00Z' where vehicle_id = $1",
        [v1],
      );
      await plate(c, v2, "T123ITA", "2026-06-01T00:00:00Z");
      await plate(c, v1, "T456ITB", "2026-06-01T00:00:00Z");
      await expectFailure(
        c,
        `update vehicle_registrations set valid_to = valid_from where vehicle_id = $1`,
        [v2],
        "23514",
        "vehicle_registrations_period",
      );
    });
  });

  it("ownership: at most one OWNER at a time; back-to-back transfers allowed; keepers separate", async () => {
    await inRollback(async (c) => {
      const v = await vehicle(c);
      const a = await customer(c, "Owner A");
      const b = await customer(c, "Owner B");
      await owner(c, v, a, "2026-01-01T00:00:00Z");
      await expectFailure(
        c,
        `insert into vehicle_ownerships (vehicle_id, customer_id, role, started_at, source, recorded_by_staff_user_id) values ($1, $2, 'OWNER', '2026-03-01', 'TRANSFER', $3)`,
        [v, b, staffId],
        "23P01",
        "vehicle_ownerships_one_owner",
      );
      await c.query(
        "update vehicle_ownerships set ended_at = '2026-03-01T00:00:00Z' where vehicle_id = $1",
        [v],
      );
      await owner(c, v, b, "2026-03-01T00:00:00Z");
      await owner(c, v, a, "2026-03-01T00:00:00Z", null, "KEEPER"); // previous owner kept as a driver
      await expectFailure(
        c,
        `insert into vehicle_ownerships (vehicle_id, customer_id, role, started_at, source, recorded_by_staff_user_id) values ($1, $2, 'KEEPER', '2026-04-01', 'REGISTRATION', $3)`,
        [v, a, staffId],
        "23P01",
        "vehicle_ownerships_keeper_no_overlap",
      );
      await expectFailure(
        c,
        `insert into vehicle_ownerships (vehicle_id, customer_id, role, started_at, source, recorded_by_staff_user_id) values ($1, $2, 'OWNER', '2026-01-01', 'SALE', $3)`,
        [v, a, staffId],
        "23514",
        "vehicle_ownerships_source",
      );
    });
  });

  it("RESTRICT: customers, vehicles and staff with history cannot be hard-deleted", async () => {
    await inRollback(async (c) => {
      const v = await vehicle(c);
      const a = await customer(c, "Restrict A");
      await owner(c, v, a, "2026-01-01T00:00:00Z");
      await expectFailure(c, "delete from customers where id = $1", [a], "23001");
      await expectFailure(c, "delete from vehicles where id = $1", [v], "23001");
      await expectFailure(c, "delete from staff_users where id = $1", [staffId], "23001");
    });
  });

  it(
    "concurrency: a second session cannot claim an overlapping owner or plate while the first holds it",
    { timeout: 60_000 },
    async () => {
      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query("BEGIN");
        staffId = (await a.query<{ id: string }>(STAFF_FIXTURE_SQL)).rows[0]!.id;
        const v = await vehicle(a);
        const c1 = await customer(a, "Race A");
        const c2 = await customer(a, "Race B");
        await a.query("COMMIT"); // committed fixtures removed in finally (no audit rows involved)
        try {
          await a.query("BEGIN");
          await b.query("BEGIN");
          await b.query("SET LOCAL lock_timeout = '1500ms'");
          await owner(a, v, c1, "2026-05-01T00:00:00Z"); // session A holds the owner slot (uncommitted)
          await plate(a, v, "T777RACE", "2026-05-01T00:00:00Z");
          // Session B must wait for A and gives up: it can never commit an overlapping claim.
          await expect(owner(b, v, c2, "2026-05-02T00:00:00Z")).rejects.toMatchObject({
            code: "55P03",
          });
          await b.query("ROLLBACK");
          await b.query("BEGIN");
          await a.query("COMMIT");
          // Once A commits, B is rejected by the exclusion constraints immediately.
          await expect(owner(b, v, c2, "2026-05-02T00:00:00Z")).rejects.toMatchObject({
            code: "23P01",
            constraint: "vehicle_ownerships_one_owner",
          });
          await b.query("ROLLBACK");
          const v2 = await vehicle(b);
          await expect(plate(b, v2, "T777RACE", "2026-05-03T00:00:00Z")).rejects.toMatchObject({
            code: "23P01",
            constraint: "vehicle_registrations_plate_no_overlap",
          });
          await b.query("delete from vehicles where id = $1", [v2]);
        } finally {
          await a.query("ROLLBACK").catch(() => undefined);
          await b.query("ROLLBACK").catch(() => undefined);
          await a.query("delete from vehicle_registrations where vehicle_id = $1", [v]);
          await a.query("delete from vehicle_ownerships where vehicle_id = $1", [v]);
          await a.query("delete from vehicles where id = $1", [v]);
          await a.query("delete from customers where id = any($1::uuid[])", [[c1, c2]]);
          await a.query("delete from staff_users where id = $1", [staffId]);
        }
      } finally {
        a.release();
        b.release();
      }
    },
  );

  it("rate_limit_buckets: atomic upsert counter", async () => {
    await inRollback(async (c) => {
      const up = `insert into rate_limit_buckets (key, window_start, count, expires_at) values ('it:test', '2026-01-01T00:00:00Z', 1, '2026-01-01T00:15:00Z')
                  on conflict (key, window_start) do update set count = rate_limit_buckets.count + 1 returning count`;
      expect((await c.query<{ count: number }>(up)).rows[0]!.count).toBe(1);
      expect((await c.query<{ count: number }>(up)).rows[0]!.count).toBe(2);
      await expectFailure(
        c,
        "insert into rate_limit_buckets (key, window_start, count, expires_at) values ('x', now(), -1, now() + interval '1 minute')",
        [],
        "23514",
        "rate_limit_buckets_count_non_negative",
      );
    });
  });
});
