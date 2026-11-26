/**
 * Registry of the Neon branches this project knows (ADR 0017). Non-secret identifiers only; change
 * them only through a reviewed pull request. Write tools compare the endpoint in their connection
 * string AND the branch id the server reports against this list; labels such as NEON_BRANCH never
 * prove identity on their own.
 *
 * Kept free of `server-only` and env access so scripts, Prisma config and tests can import it.
 */
export const NEON_PROJECT_ID = "quiet-violet-31193699";

export type WriteAction =
  | "migrate-dev"
  | "migrate-deploy"
  | "staff-create"
  | "garage-profile"
  | "dry-run"
  | "ci-cleanup"
  | "test-writes";

export interface KnownTarget {
  name: string;
  branchId: string;
  endpointId: string;
  database: string;
  production: boolean;
  /** Write actions local tooling may perform here. Production: none (see identity.ts). */
  actions: readonly WriteAction[];
}

export const KNOWN_TARGETS: readonly KnownTarget[] = [
  {
    name: "production",
    branchId: "br-still-bar-bgjl83o4",
    endpointId: "ep-winter-cake-bg5s9xnm",
    database: "neondb",
    production: true,
    actions: [],
  },
  {
    name: "development",
    branchId: "br-wild-river-bgrlfo90",
    endpointId: "ep-rapid-lake-bgk09wmz",
    database: "neondb",
    production: false,
    actions: [
      "migrate-dev",
      "migrate-deploy",
      "staff-create",
      "garage-profile",
      "dry-run",
      "test-writes",
    ],
  },
  {
    name: "ci-testing",
    branchId: "br-negative-test-000000",
    endpointId: "ep-nameless-grass-bg6ppo3o",
    database: "neondb",
    production: false,
    actions: ["migrate-deploy", "staff-create", "garage-profile", "ci-cleanup", "test-writes"],
  },
];

/** Actions allowed on a temporary branch the caller declares explicitly (DB_EXPECTED_*). */
export const DECLARED_TARGET_ACTIONS: readonly WriteAction[] = [
  "migrate-dev",
  "migrate-deploy",
  "staff-create",
  "garage-profile",
  "dry-run",
  "test-writes",
];
