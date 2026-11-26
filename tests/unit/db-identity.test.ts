import { describe, expect, it, vi } from "vitest";

import {
  assertClientBranch,
  connectionKinds,
  parseConnection,
  planWriteTarget,
  verifyCiTarget,
  verifyWriteTarget,
  type IdentityProbe,
} from "@/server/db/identity";
import { KNOWN_TARGETS } from "@/server/db/known-targets";
import { UnsafeDatabaseTargetError } from "@/server/db/target";

const PW = "s3cret-pw-do-not-print";
const url = (
  endpoint: string,
  pooled: boolean,
  extra = "sslmode=require&channel_binding=require",
) =>
  `postgresql://neondb_owner:${PW}@${endpoint}${pooled ? "-pooler" : ""}.c-9.eu-central-1.aws.neon.tech/neondb?${extra}`;

const target = (name: string) => KNOWN_TARGETS.find((t) => t.name === name)!;
const DEV = target("development");
const CI = target("ci-testing");
const PROD = target("production");
const TEMP = { branchId: "br-morning-tree-bg5opwfi", endpointId: "ep-raspy-mode-bglkdrgi" };

const envFor = (t: { endpointId: string }, label: string, more: Record<string, string> = {}) => ({
  DATABASE_URL: url(t.endpointId, true),
  DATABASE_URL_UNPOOLED: url(t.endpointId, false),
  NEON_BRANCH: label,
  ...more,
});

/** A fake server that reports the given branch for every connection. */
const serverAt =
  (branchId: string | null, database = "neondb"): IdentityProbe =>
  async () => ({ branchId, database, role: "neondb_owner" });

const both = ["pooled", "direct"] as const;

async function refusal(p: Promise<unknown>) {
  const error = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(UnsafeDatabaseTargetError);
  expect(String(error)).not.toContain(PW);
  expect(String(error)).not.toContain("postgresql://");
  return String(error);
}

describe("parseConnection", () => {
  it("extracts the endpoint id from pooled and direct Neon hosts", () => {
    expect(parseConnection("pooled", url("ep-rapid-lake-bgk09wmz", true)).endpointId).toBe(
      "ep-rapid-lake-bgk09wmz",
    );
    expect(parseConnection("direct", url("ep-rapid-lake-bgk09wmz", false)).endpointId).toBe(
      "ep-rapid-lake-bgk09wmz",
    );
  });

  it.each([
    ["non-Neon host", "postgresql://u:p@db.example.com/neondb?sslmode=require"],
    ["missing sslmode", url("ep-a-b", false, "")],
    ["sslmode=disable", url("ep-a-b", false, "sslmode=disable")],
    ["pooled host as direct", url("ep-a-b", true)],
    ["not a URL", "not a url"],
    ["no database", "postgresql://u:p@ep-a-b.c-9.eu-central-1.aws.neon.tech/?sslmode=require"],
    ["wrong protocol", "mysql://u:p@ep-a-b.c-9.eu-central-1.aws.neon.tech/neondb?sslmode=require"],
  ])("refuses %s", (_, u) => {
    expect(() => parseConnection("direct", u)).toThrow(UnsafeDatabaseTargetError);
  });

  it("refuses a direct host as the pooled string", () => {
    expect(() => parseConnection("pooled", url("ep-a-b", false))).toThrow(/pooled/);
  });
});

describe("planWriteTarget (pure checks)", () => {
  it("selects the registered target by the exact endpoint", () => {
    expect(planWriteTarget("migrate-dev", envFor(DEV, "development"), both).target.branchId).toBe(
      DEV.branchId,
    );
  });

  it.each<[string, Record<string, string | undefined>]>([
    ["an unset label", envFor(DEV, "")],
    ["a wrong label", envFor(DEV, "ci-testing")],
    ["a production URL labelled development", envFor(PROD, "development")],
    ["a wrong NEON_BRANCH_ID", envFor(DEV, "development", { NEON_BRANCH_ID: CI.branchId })],
    ["an unregistered endpoint", envFor({ endpointId: "ep-unknown-x1" }, "development")],
    [
      "pooled and direct on different endpoints",
      { ...envFor(DEV, "development"), DATABASE_URL: url(CI.endpointId, true) },
    ],
    ["NODE_ENV=production", envFor(DEV, "development", { NODE_ENV: "production" })],
  ])("refuses %s", (_, env) => {
    expect(() => planWriteTarget("migrate-dev", env, both)).toThrow(UnsafeDatabaseTargetError);
  });

  it("refuses actions that are not allowed on the target", () => {
    expect(() => planWriteTarget("ci-cleanup", envFor(DEV, "development"), both)).toThrow(
      /not allowed/,
    );
    expect(() => planWriteTarget("migrate-dev", envFor(CI, "ci-testing"), both)).toThrow(
      /not allowed/,
    );
  });

  it("requires the connections the tool will use", () => {
    expect(() =>
      planWriteTarget("migrate-deploy", { NEON_BRANCH: "development" }, ["direct"]),
    ).toThrow(/required/);
  });

  describe("declared temporary branch", () => {
    const decl = { DB_EXPECTED_BRANCH_ID: TEMP.branchId, DB_EXPECTED_ENDPOINT_ID: TEMP.endpointId };

    it("is accepted only with both ids, matching the URL endpoint", () => {
      const { target: t } = planWriteTarget(
        "test-writes",
        envFor(TEMP, "verify-phase-1b-20261125", decl),
        both,
      );
      expect(t).toMatchObject({ declared: true, production: false, branchId: TEMP.branchId });
      expect(() =>
        planWriteTarget(
          "test-writes",
          envFor(TEMP, "verify", { DB_EXPECTED_BRANCH_ID: TEMP.branchId }),
          both,
        ),
      ).toThrow(/both/);
      expect(() =>
        planWriteTarget(
          "test-writes",
          envFor(DEV, "verify", decl), // URL is development, declaration says temp
          both,
        ),
      ).toThrow(/not the expected endpoint/);
    });

    it("may not reuse a registered name, branch or endpoint", () => {
      expect(() => planWriteTarget("test-writes", envFor(TEMP, "development", decl), both)).toThrow(
        UnsafeDatabaseTargetError,
      );
      expect(() =>
        planWriteTarget(
          "test-writes",
          envFor(PROD, "verify", {
            DB_EXPECTED_BRANCH_ID: TEMP.branchId,
            DB_EXPECTED_ENDPOINT_ID: PROD.endpointId,
          }),
          both,
        ),
      ).toThrow(/disagree/);
    });

    it("never allows ci-cleanup", () => {
      expect(() => planWriteTarget("ci-cleanup", envFor(TEMP, "verify", decl), both)).toThrow(
        /not allowed/,
      );
    });
  });

  describe("production", () => {
    const prodEnv = (more: Record<string, string> = {}) => envFor(PROD, "production", more);
    const override = {
      ALLOW_PRODUCTION_DB_WRITES: "true",
      CONFIRM_PRODUCTION_BRANCH_ID: PROD.branchId,
    };

    it("is refused for every action without the double confirmation", () => {
      for (const action of [
        "migrate-dev",
        "migrate-deploy",
        "staff-create",
        "test-writes",
      ] as const)
        expect(() => planWriteTarget(action, prodEnv(), both)).toThrow(UnsafeDatabaseTargetError);
      expect(() =>
        planWriteTarget("migrate-deploy", prodEnv({ ALLOW_PRODUCTION_DB_WRITES: "true" }), both),
      ).toThrow(/production/);
      expect(() =>
        planWriteTarget(
          "migrate-deploy",
          prodEnv({ ...override, CONFIRM_PRODUCTION_BRANCH_ID: DEV.branchId }),
          both,
        ),
      ).toThrow(/production/);
    });

    it("allows only migrate-deploy with the override, and never from a pull-request job", () => {
      expect(planWriteTarget("migrate-deploy", prodEnv(override), both).target.production).toBe(
        true,
      );
      expect(() => planWriteTarget("staff-create", prodEnv(override), both)).toThrow(/production/);
      expect(() =>
        planWriteTarget(
          "migrate-deploy",
          prodEnv({ ...override, GITHUB_EVENT_NAME: "pull_request" }),
          both,
        ),
      ).toThrow(/production/);
    });
  });
});

describe("verifyWriteTarget (server-reported identity)", () => {
  const env = envFor(DEV, "development");

  it("passes when every connection reports the expected branch", async () => {
    const probe = vi.fn(serverAt(DEV.branchId));
    const v = await verifyWriteTarget("migrate-dev", env, { connections: both, probe });
    expect(v).toMatchObject({ name: "development", branchId: DEV.branchId, checked: both });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("refuses when the server reports another branch (e.g. a copied production URL)", async () => {
    const msg = await refusal(
      verifyWriteTarget("migrate-dev", env, { connections: both, probe: serverAt(PROD.branchId) }),
    );
    expect(msg).toContain(PROD.branchId);
  });

  it("refuses when only one of the two connections is on another branch", async () => {
    let n = 0;
    const probe: IdentityProbe = async () => ({
      branchId: n++ === 0 ? DEV.branchId : CI.branchId,
      database: "neondb",
      role: "r",
    });
    await refusal(verifyWriteTarget("migrate-dev", env, { connections: both, probe }));
  });

  it("refuses when the server reports no branch id or another database", async () => {
    await refusal(
      verifyWriteTarget("migrate-dev", env, { connections: both, probe: serverAt(null) }),
    );
    await refusal(
      verifyWriteTarget("migrate-dev", env, {
        connections: both,
        probe: serverAt(DEV.branchId, "postgres"),
      }),
    );
  });

  it("refuses when the probe fails or hangs", async () => {
    await refusal(
      verifyWriteTarget("migrate-dev", env, {
        connections: both,
        probe: async () => {
          throw new Error(`connect failed ${url(DEV.endpointId, false)}`);
        },
      }),
    );
    await refusal(
      verifyWriteTarget("migrate-dev", env, {
        connections: both,
        probe: () => new Promise(() => {}),
        timeoutMs: 20,
      }),
    );
  });

  it("does not probe at all when the pure checks fail", async () => {
    const probe = vi.fn(serverAt(PROD.branchId));
    await refusal(
      verifyWriteTarget("migrate-dev", envFor(PROD, "development"), { connections: both, probe }),
    );
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("verifyCiTarget", () => {
  const pin = { DB_EXPECTED_BRANCH_ID: CI.branchId, DB_EXPECTED_ENDPOINT_ID: CI.endpointId };
  const ciEnv = (more: Record<string, string> = {}) =>
    envFor(CI, "ci-testing", {
      ...pin,
      CI_FORBIDDEN_ENDPOINTS: `${DEV.endpointId},${PROD.endpointId}`,
      ...more,
    });

  it("passes only for the pinned ci-testing branch on both connections", async () => {
    const v = await verifyCiTarget("ci-cleanup", ciEnv(), { probe: serverAt(CI.branchId) });
    expect(v).toMatchObject({ name: "ci-testing", checked: ["pooled", "direct"] });
  });

  it("refuses without the pin, or with a pin that is not the registry's ci-testing", async () => {
    await refusal(
      verifyCiTarget("ci-cleanup", envFor(CI, "ci-testing"), { probe: serverAt(CI.branchId) }),
    );
    await refusal(
      verifyCiTarget(
        "ci-cleanup",
        ciEnv({ DB_EXPECTED_BRANCH_ID: TEMP.branchId, DB_EXPECTED_ENDPOINT_ID: TEMP.endpointId }),
        { probe: serverAt(TEMP.branchId) },
      ),
    );
  });

  it("refuses another endpoint even if it is not on the deny-list (allow-list, not deny-list)", async () => {
    const other = envFor(TEMP, "ci-testing", pin);
    await refusal(verifyCiTarget("ci-cleanup", other, { probe: serverAt(CI.branchId) }));
  });

  it("refuses a deny-listed endpoint and a server that reports another branch", async () => {
    await refusal(
      verifyCiTarget("ci-cleanup", ciEnv({ CI_FORBIDDEN_ENDPOINTS: CI.endpointId }), {
        probe: serverAt(CI.branchId),
      }),
    );
    await refusal(verifyCiTarget("ci-cleanup", ciEnv(), { probe: serverAt(DEV.branchId) }));
  });

  it("requires both the pooled and the direct string", async () => {
    const env: Record<string, string | undefined> = ciEnv();
    delete env.DATABASE_URL;
    await refusal(verifyCiTarget("ci-cleanup", env, { probe: serverAt(CI.branchId) }));
  });
});

describe("assertClientBranch (in-transaction re-check)", () => {
  const client = (branch_id: string | null) => ({
    query: vi.fn(async () => ({ rows: [{ branch_id, db: "neondb", role: "r" }] })),
  });

  it("accepts the expected branch and refuses any other", async () => {
    await expect(assertClientBranch(client(CI.branchId), CI)).resolves.toBeUndefined();
    await expect(assertClientBranch(client(DEV.branchId), CI)).rejects.toThrow(
      UnsafeDatabaseTargetError,
    );
    await expect(assertClientBranch(client(null), CI)).rejects.toThrow(UnsafeDatabaseTargetError);
  });
});

describe("connectionKinds", () => {
  it("adds the other connection only when configured", () => {
    expect(connectionKinds({ DATABASE_URL: "x" }, "pooled")).toEqual(["pooled"]);
    expect(connectionKinds(envFor(DEV, "development"), "pooled")).toEqual(["pooled", "direct"]);
    expect(connectionKinds(envFor(DEV, "development"), "direct")).toEqual(["direct", "pooled"]);
  });
});

describe("registry", () => {
  it("has unique names, branch ids and endpoint ids, and exactly one production target", () => {
    for (const key of ["name", "branchId", "endpointId"] as const)
      expect(new Set(KNOWN_TARGETS.map((t) => t[key])).size).toBe(KNOWN_TARGETS.length);
    expect(KNOWN_TARGETS.filter((t) => t.production)).toEqual([PROD]);
    expect(PROD.actions).toEqual([]);
  });
});
