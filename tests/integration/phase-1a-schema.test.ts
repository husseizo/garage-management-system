import "dotenv/config";

import { Pool, type PoolClient } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Phase 1A schema integrity checks against the live Neon DEVELOPMENT branch.
 *
 * Every test runs inside BEGIN … ROLLBACK, so nothing is persisted. Skipped (never reported as
 * passed) without a database, and refused outright for production branch names.
 */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED;
const isProductionBranch = /^(production|prod|main)$/i.test(process.env.NEON_BRANCH ?? "");
const enabled = Boolean(url) && !isProductionBranch;

const VALID_PROFILE = {
  display_name: "Test Garage",
  country_code: "TZ",
  timezone: "Africa/Dar_es_Salaam",
  currency_code: "TZS",
};

describe.skipIf(!enabled)("Phase 1A schema (development branch, rolled back)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool?.end();
  });

  /**
   * Runs `fn` in a transaction that is always rolled back. The real development garage profile
   * (if any) is removed inside the transaction only, so singleton tests start from zero rows.
   */
  async function inRollback(fn: (c: PoolClient) => Promise<void>) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("delete from garage_profile");
      await fn(c);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  }

  /** Expects `sql` to fail with `code` (and optional constraint), isolated by a savepoint. */
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
      expect.unreachable(`expected failure ${code}`);
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      expect(e.code).toBe(code);
      if (constraint) expect(e.constraint).toBe(constraint);
    } finally {
      await c.query("ROLLBACK TO SAVEPOINT s");
    }
  }

  const insertProfile = (p: Record<string, string>) => {
    const cols = Object.keys(p);
    return [
      `insert into garage_profile (${cols.join(", ")}, updated_at) values (${cols
        .map((_, i) => `$${i + 1}`)
        .join(", ")}, now()) returning id::text`,
      Object.values(p),
    ] as const;
  };

  it("runs on the expected database with both migrations applied", async () => {
    const c = await pool.connect();
    try {
      const { rows } = await c.query<{ name: string }>(
        "select migration_name as name from _prisma_migrations where finished_at is not null order by 1",
      );
      expect(rows.map((r) => r.name)).toEqual([
        "20261123000000_init_staff_users",
        "20261124000000_phase_1a_platform_foundation",
      ]);
      const ver = await c.query<{ v: number }>(
        "select current_setting('server_version_num')::int v",
      );
      expect(ver.rows[0]!.v).toBeGreaterThanOrEqual(180000);
    } finally {
      c.release();
    }
  });

  it("garage_profile: generates a UUIDv7 key and accepts a valid profile", async () => {
    await inRollback(async (c) => {
      const [sql, params] = insertProfile(VALID_PROFILE);
      const { rows } = await c.query<{ id: string }>(sql, [...params]);
      expect(rows[0]!.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });
  });

  it("garage_profile: allows at most one row (singleton)", async () => {
    await inRollback(async (c) => {
      const [sql, params] = insertProfile(VALID_PROFILE);
      await c.query(sql, [...params]);
      await expectFailure(c, sql, [...params], "23505", "garage_profile_singleton_key");
      await expectFailure(
        c,
        `insert into garage_profile (singleton, display_name, country_code, timezone, currency_code, updated_at)
         values (false, 'X', 'TZ', 'UTC', 'TZS', now())`,
        [],
        "23514",
        "garage_profile_singleton_true",
      );
    });
  });

  it.each([
    ["country_code", "tz", "garage_profile_country_code_iso"],
    ["currency_code", "TS1", "garage_profile_currency_code_iso"],
    ["timezone", "Not a zone!", "garage_profile_timezone_iana"],
    ["display_name", "   ", "garage_profile_display_name_len"],
  ])("garage_profile: rejects invalid %s", async (col, value, constraint) => {
    await inRollback(async (c) => {
      const [sql, params] = insertProfile({ ...VALID_PROFILE, [col]: value });
      await expectFailure(c, sql, [...params], "23514", constraint);
    });
  });

  it("garage_profile: enforces E.164 phone and email shape", async () => {
    await inRollback(async (c) => {
      const bad = insertProfile({ ...VALID_PROFILE, contact_phone_e164: "0712 345 678" });
      await expectFailure(c, bad[0], [...bad[1]], "23514", "garage_profile_contact_phone_e164");
      const badMail = insertProfile({ ...VALID_PROFILE, contact_email: "not-an-email" });
      await expectFailure(
        c,
        badMail[0],
        [...badMail[1]],
        "23514",
        "garage_profile_contact_email_format",
      );
      const ok = insertProfile({
        ...VALID_PROFILE,
        contact_phone_e164: "+255712345678",
        contact_email: "desk@garage.example",
      });
      await c.query(ok[0], [...ok[1]]);
    });
  });

  it("audit_logs: requires a real staff user for STAFF actors (FK) and none for SYSTEM", async () => {
    await inRollback(async (c) => {
      await expectFailure(
        c,
        "insert into audit_logs (actor_type, actor_staff_user_id, action) values ('STAFF', 'no-such-user', 'staff.sign_in')",
        [],
        "23503",
        "audit_logs_actor_staff_user_id_fkey",
      );
      await expectFailure(
        c,
        "insert into audit_logs (actor_type, action) values ('STAFF', 'staff.sign_in')",
        [],
        "23514",
        "audit_logs_staff_actor_consistent",
      );
      const staff = await c.query<{ id: string }>("select id from staff_users limit 1");
      await expectFailure(
        c,
        "insert into audit_logs (actor_type, actor_staff_user_id, action) values ('SYSTEM', $1, 'job.ran')",
        [staff.rows[0]?.id ?? "x"],
        staff.rows[0] ? "23514" : "23503",
      );
      await c.query("insert into audit_logs (actor_type, action) values ('SYSTEM', 'job.ran')");
    });
  });

  it("audit_logs: validates action format, entity pairing and JSON shape", async () => {
    await inRollback(async (c) => {
      const ins =
        "insert into audit_logs (actor_type, action, entity_type, entity_id, changes) values ('SYSTEM', $1, $2, $3, $4)";
      await expectFailure(
        c,
        ins,
        ["Created", null, null, null],
        "23514",
        "audit_logs_action_format",
      );
      await expectFailure(
        c,
        ins,
        ["x.created", "garage_profile", null, null],
        "23514",
        "audit_logs_entity_pair",
      );
      await expectFailure(
        c,
        ins,
        ["x.created", "Garage Profile", "1", null],
        "23514",
        "audit_logs_entity_type_format",
      );
      await expectFailure(
        c,
        ins,
        ["x.created", null, null, "[1,2]"],
        "23514",
        "audit_logs_changes_object",
      );
      await c.query(ins, [
        "garage_profile.updated",
        "garage_profile",
        "abc",
        '{"timezone":{"from":"UTC","to":"Africa/Nairobi"}}',
      ]);
    });
  });

  it("audit_logs: is append-only (UPDATE, DELETE and TRUNCATE are rejected)", async () => {
    await inRollback(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        "insert into audit_logs (actor_type, action) values ('SYSTEM', 'test.append_only') returning id::text",
      );
      const id = rows[0]!.id;
      await expectFailure(
        c,
        "update audit_logs set action = 'test.changed' where id = $1",
        [id],
        "42501",
      );
      await expectFailure(c, "delete from audit_logs where id = $1", [id], "42501");
      await expectFailure(c, "truncate audit_logs", [], "42501");
    });
  });

  it("staff_users: a staff user with audit history cannot be hard-deleted (RESTRICT)", async () => {
    await inRollback(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into staff_users (id, email, name, password_hash, updated_at)
         values ('it-restrict-' || gen_random_uuid(), 'restrict-' || gen_random_uuid() || '@example.test', 'IT', 'x', now())
         returning id`,
      );
      const staffId = rows[0]!.id;
      await c.query(
        "insert into audit_logs (actor_type, actor_staff_user_id, action) values ('STAFF', $1, 'staff.sign_in')",
        [staffId],
      );
      await expectFailure(c, "delete from staff_users where id = $1", [staffId], "23001");
    });
  });
});
