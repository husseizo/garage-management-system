# Phase 1C-0 proposal — database safety and authentication hardening

- **Status:** **Approved by the owner on 2026-11-26 (PRs 1–3).** G-2 part C (credentials, roles,
  grants) still needs separate approval and is not part of PRs 1–3.
- **Date:** 2026-11-26
- **Base:** `develop` at `be2f9df` (tag `phase-1b-verified`)
- **Addresses:** G-1, G-2, G-3 (database target identity) and S-1 Step 1 (ADR 0016)
- **Ground rules:** every database write guard **fails closed**. No guard treats `NEON_BRANCH`, any
  other environment label or an endpoint deny-list as proof of identity. Application-level guards
  prevent **accidents and misconfiguration**. They **cannot** stop someone who holds privileged
  credentials from connecting directly (`psql`, Neon Console, Neon API). Only credential separation
  and database permissions (G-2, part C) limit that, and only partly.

## 0. Current state (read-only findings, 2026-11-26)

| Fact                                                                                                                                                                                            | Source                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `assertWritableTarget()` refuses only when `NEON_BRANCH` is `production`/`prod`/`main` or `NODE_ENV=production`. An **unset** label passes                                                      | `src/server/db/target.ts`               |
| `prisma.config.ts` resolves the direct URL but runs no guard. Only `npm run db:migrate:*` calls `scripts/db-guard.ts` first                                                                     | `prisma.config.ts`, `package.json`      |
| `verify-ci-target` checks `NEON_BRANCH === "ci-testing"`, but the workflow sets that label itself. It also checks that pooled and direct URLs share an endpoint, and a deny-list of 2 endpoints | `scripts/verify-ci-target.ts`, `ci.yml` |
| `ci-cleanup` checks the same label and deny-list, then deletes                                                                                                                                  | `scripts/ci-cleanup.ts`                 |
| No guard asks the database which branch it actually is                                                                                                                                          | —                                       |
| `development` (`br-wild-river-bgrlfo90`) and `ci-testing` (`br-dawn-lake-bgrg54n5`) are **children of `production`** (`br-still-bar-bgjl83o4`). All use role `neondb_owner`                     | Neon API branch list (metadata only)    |
| `production` is not a Neon protected branch                                                                                                                                                     | Neon API branch list                    |
| Runtime, migrations, scripts and CI all use `neondb_owner`, the owner role with DDL rights                                                                                                      | `.env` layout, CI secrets naming        |
| `getStaffSession()` trusts `role` from the JWT and never reads `staff_users`. There are 21 files using the guards                                                                               | `src/server/auth/guards.ts`             |

Neon copies roles from the parent branch when it creates a branch. Per Neon's documentation, the
copied roles keep the parent's password until it is reset. So **a development or CI password may
also authenticate on production** if someone changes only the hostname. I have **not tested this**,
because it would mean connecting to production. G-2 part C removes the risk without testing it.

---

## G-1 — Database identity verified independently of labels

### Root cause

The local write guard (`assertWritableTarget`) uses a deny-list on a self-declared label:

- It never looks at the endpoint in the URL.
- It never asks the server which branch it is.
- With `NEON_BRANCH` unset it allows everything, so it fails **open**.
- A production URL labelled `NEON_BRANCH=development` passes.

### Proposed implementation

1. **Committed target registry**, `src/server/db/known-targets.ts`. It holds non-secret IDs only,
   changed only by a reviewed PR:

   | Name          | Branch id                | Endpoint id                  | Database | Allowed write actions                                                          |
   | ------------- | ------------------------ | ---------------------------- | -------- | ------------------------------------------------------------------------------ |
   | `production`  | `br-still-bar-bgjl83o4`  | `ep-winter-cake-bg5s9xnm`    | `neondb` | none by default (see 5)                                                        |
   | `development` | `br-wild-river-bgrlfo90` | `ep-rapid-lake-bgk09wmz`     | `neondb` | `migrate-dev`, `migrate-deploy`, `staff-create`, `garage-profile`, `dry-run`   |
   | `ci-testing`  | `br-dawn-lake-bgrg54n5`  | `ep-nameless-grass-bg6ppo3o` | `neondb` | `migrate-deploy`, `staff-create`, `garage-profile`, `ci-cleanup`, `e2e-writes` |

   Temporary branches are not listed. A script may target one only when the caller sets
   `DB_EXPECTED_BRANCH_ID` and `DB_EXPECTED_ENDPOINT_ID`, and the IDs pass every check below. The
   registry's production IDs are always refused for them.

2. **New module `src/server/db/identity.ts`**, which tools use before a write:
   `verifyWriteTarget(action, env, probe)`. Every step must pass; any exception, timeout or missing
   value **refuses**.
   1. **URL checks (pure):**
      - The direct URL is present.
      - Its host matches `ep-…[.-pooler].<region>.aws.neon.tech`.
      - `sslmode=require` or stricter.
      - The pooled and direct URLs, where both are used, give the **same** endpoint id.
      - The database name matches.
   2. **Expected target:**
      - Resolve the expected branch and endpoint from the registry, or from the explicit
        `DB_EXPECTED_*` variables.
      - The URL's endpoint id must **equal** the expected endpoint id (allow-list, exact match).
      - The action must be in the target's allowed actions.
   3. **Server-reported identity (probe):**
      - On the **same connection string** the action will use, run `SELECT
current_setting('neon.branch_id', true) AS branch_id, current_database() AS db,
current_user AS role`.
      - Refuse if `branch_id` is null or differs from the expected branch id. Do the same over the
        pooled URL when the action also uses it.
   4. **Label consistency:** if `NEON_BRANCH` or `NEON_BRANCH_ID` is set and disagrees with the
      verified identity, refuse. Labels can cause a refusal but can never cause an acceptance.
   5. **Production:** a verified branch id equal to production is refused unless all of these hold:
      - `ALLOW_PRODUCTION_DB_WRITES=true`;
      - `CONFIRM_PRODUCTION_BRANCH_ID` equals the **server-reported** id;
      - the action is `migrate-deploy`;
      - the process is not a CI pull-request job.

      Production migrations still need separate owner approval.

   6. Output is IDs only. Connection strings are never logged.
3. **Callers switch to `verifyWriteTarget`:**
   - `scripts/db-guard.ts`;
   - `create-staff-user.ts`, `set-garage-profile.ts`, `db-dry-run.ts`;
   - `ci-cleanup.ts` and `verify-ci-target.ts` (see G-3);
   - the rate-limit integration test, which today gates on the label only.

   `assertWritableTarget` stays as an extra pure pre-check, changed to fail closed: an unset
   `NEON_BRANCH` is refused for writes.

### Security guarantees

- A write tool runs only when three things agree:
  - the endpoint in its URL (exact allow-list);
  - the branch id reported by that same connection;
  - the expected target for that action.
- A wrong or missing label, a copied production URL, a new or renamed endpoint, or a temporary
  branch not explicitly declared: **refused**.
- Network error, timeout, non-Neon server (null `neon.branch_id`): **refused**.

### Known limitations

- `neon.branch_id` is a server setting. A hostile or non-Neon PostgreSQL server could fake it. The
  defence relies on that **and** the TLS-verified `*.neon.tech` host **and** the exact endpoint
  match.
- There is a time gap between the check and the write when they use different connections.
  Mitigations: the same URL is used for both; `ci-cleanup` probes inside its deleting transaction;
  G-2's `db-run` executes Prisma immediately with the verified environment.
- The guard protects **our tools only**. `psql`, the Neon Console or any other client with valid
  credentials is unaffected (see G-2 part C).
- If Neon recreates an endpoint, its id changes and every write tool refuses until the registry is
  updated by PR. That is intended, but it is an operational step.

### Files affected

- **New:** `src/server/db/identity.ts`, `src/server/db/known-targets.ts`.
- **Modified:**
  - `src/server/db/target.ts`;
  - `scripts/db-guard.ts`, `create-staff-user.ts`, `set-garage-profile.ts`, `db-dry-run.ts`;
  - `tests/integration/rate-limit.test.ts`;
  - `src/server/env-schema.ts` and `.env.example` (`DB_EXPECTED_BRANCH_ID`,
    `DB_EXPECTED_ENDPOINT_ID`, `CONFIRM_PRODUCTION_BRANCH_ID`, all optional; no secrets);
  - `docs/operations/*.md`.
- **New ADR:** `0017-database-target-identity.md`.

### Automated tests

- **Unit, `tests/unit/db-identity.test.ts`**, using an injected fake probe. Each of these cases must
  refuse:
  - unset label;
  - wrong label;
  - production URL with a development label;
  - endpoint not allow-listed;
  - pooled and direct on different endpoints;
  - `sslmode` missing;
  - probe returns another branch;
  - probe returns null;
  - probe throws;
  - probe times out;
  - action not allowed for the target;
  - production without the double confirmation;
  - production with the confirmation but from a PR job.

  The happy paths for development, ci-testing and a declared temporary branch must pass. The
  refusal messages must contain no URL or password.

- **Integration, read-only:** on `ci-testing`, the probe returns `br-dawn-lake-bgrg54n5`, and a
  deliberately wrong expected id is refused. There are no writes.
- **Existing suites unchanged:** unit 164, integration 38, E2E 84 still pass.

### Acceptance criteria

- Every refusal path above exits non-zero **before** any write, as shown by unit tests.
- `db:migrate:deploy`, `staff:create`, `garage:profile` and `db:ci-cleanup` keep working on
  `ci-testing` in CI. The log shows the server-reported branch id and endpoint id.
- `grep` of CI logs finds no connection strings.

### Rollback

Revert the PR. There is no schema change, and the new variables are optional and ignored by the
old code.

---

## G-2 — Bypassing the guarded Prisma commands; permissions and credential separation

### Root cause

- **Guard placement.** The guard is a wrapper in `npm` scripts. Running `npx prisma migrate deploy`,
  `migrate dev`, `migrate reset`, `db push`, `db execute` or `studio` loads `prisma.config.ts`,
  which hands Prisma whatever direct URL is in `.env`, with no check.
- **No separation of privilege.** Every environment, and the app runtime, uses `neondb_owner`. A
  leaked runtime credential can run DDL. Credentials copied from production may still be valid
  there (section 0).

### Proposed implementation

**A. Fail-closed check inside `prisma.config.ts` (code):**

- Classify the Prisma subcommand from `process.argv`:
  - **Read** (`generate`, `validate`, `format`, `migrate status`, `migrate diff`): no database
    write, so it is allowed.
  - **Write** (`migrate dev|deploy|resolve`, `db execute`, `studio`): needs a verification marker.
  - **Always refused** (`migrate reset`, `db push`): the project forbids resets and schema pushes.
- Prisma's config loading is synchronous and cannot run the network probe. So for write commands,
  `prisma.config.ts` requires the marker `GMS_DB_VERIFIED=<branchId>:<endpointId>`, set only by the
  runner in B. It also re-checks that the endpoint in the URL it is about to use matches the
  marker. Without a matching marker it throws before Prisma connects.
- An unknown subcommand is treated as **write**, which fails closed.

> **Implementation note (PR 2):** Prisma 7 accepts an async `prisma.config.ts`, so the full
> verification of G-1, including the server probe, runs inside the config itself. No marker and no
> separate runner are needed, and there is no gap between the check and the command. B below was
> therefore not built.

**B. Single guarded runner (code; superseded, see note above):** `scripts/db-run.ts <prisma args>`.

- It runs G-1's `verifyWriteTarget` for the matching action.
- On success, it starts `prisma` with the marker in the child's environment only.
- `db:migrate:dev` and `db:migrate:deploy` call it. `db-guard.ts` stays as a standalone check.

**C. Database permissions and credential separation.** This is operations work: it creates roles
and resets passwords, which changes credentials. **Each item needs separate owner approval, and
none is done in this PR.**

1. **Break inherited credentials.**
   - Reset the `neondb_owner` password on `development`, `ci-testing` and the temporary branch, so
     no credential copied from production remains on a non-production branch.
   - Then update `.env`, `.env.verify.local` and the two CI secrets. The owner does this; values are
     never pasted into chat.
2. **Two roles per branch.** Create them via the Neon API or Console; grants go in a reviewed,
   additive SQL migration.
   - `gms_migrator` owns the schema and is used only by migrations over the direct URL.
   - `gms_app` is the runtime role over the pooled URL:
     - `SELECT/INSERT/UPDATE/DELETE` on application tables;
     - `INSERT/SELECT` only on `audit_logs`;
     - no `TRUNCATE`, no DDL, no `CREATE` on schema `public`;
     - `ALTER DEFAULT PRIVILEGES` for future tables.

   CI tests the grants, as below.

3. **Production credentials stay off developer machines.**
   - The production URL is never written to `.env`.
   - Production migrations run only from a GitHub Actions `production` environment with a required
     reviewer (the owner) and environment-scoped secrets. That will be designed with the deployment
     decision.
4. **Neon platform controls**, where the plan allows:
   - mark `production` as a protected branch;
   - an IP allow list for production;
   - a project-scoped Neon API key for automation instead of a personal key.

   The Neon API key on this machine can fetch **any** branch's credentials. It is the master
   credential and should be treated that way.

### Security guarantees

- **A and B:** running `npx prisma migrate …`, `db push` or `migrate reset` directly is refused
  before any connection. Guarded writes go through G-1's identity verification.
- **After C1:** a development or CI password no longer works on production.
- **After C2:** a compromised application runtime cannot change the schema, truncate tables or
  rewrite audit history. The append-only trigger stays as a second layer.

### Known limitations (stated plainly)

- **A and B stop mistakes, not attackers.** Anyone can set the marker by hand, edit
  `prisma.config.ts`, or skip Prisma entirely with `psql` or the Neon Console.
- **Application-level guards cannot prevent direct database access by anyone who holds a privileged
  credential** (the `neondb_owner` password, `gms_migrator`, or the Neon API key). Only keeping
  those credentials scarce, rotated and off developer machines (C1, C3, C4) limits that. Even then,
  the project owner's Neon account can always do anything.
- `gms_app` still has `DELETE` and `UPDATE` on business tables, because the application needs them.
- C2 touches every environment's secrets and needs a rollout window (section "Rollback").

### Files affected

- **A and B:**
  - `prisma.config.ts`;
  - new `scripts/db-run.ts`;
  - new `src/server/db/prisma-command.ts`, the pure classifier;
  - `package.json` scripts;
  - `docs/operations/*.md`.
- **C (later, separately approved):**
  - one additive migration `…_app_roles_grants`, which contains only `GRANT`/`REVOKE`/`ALTER
DEFAULT PRIVILEGES` and expects the roles to exist;
  - `.github/workflows/ci.yml` (separate migrator and app secrets);
  - `src/server/db/client.ts` docs;
  - a runbook in `docs/operations/database-roles.md`.

### Automated tests

- **Unit, `tests/unit/prisma-command.test.ts`:**
  - every subcommand is classified correctly;
  - an unknown subcommand counts as write;
  - `reset` and `push` are always refused;
  - a marker whose endpoint does not match the URL is refused;
  - an empty marker is refused.
- **Process test, runs in the quality job without a database.** `npx prisma migrate deploy` with a
  dummy URL and no marker exits non-zero with the guard message, and no connection is attempted.
  Likewise for `npx prisma db push` and `npx prisma migrate reset --force`.
- **Integration on `ci-testing`, after C2 only.** As `gms_app`, each of these must fail:
  - `CREATE TABLE`;
  - `DROP`;
  - `TRUNCATE`;
  - `UPDATE`/`DELETE` on `audit_logs`;
  - `ALTER`.

  Normal DML succeeds.

### Acceptance criteria

- Direct `npx prisma` write commands are refused locally and in CI. `npm run db:migrate:deploy`
  still works on `ci-testing`.
- `prisma generate` (postinstall), `migrate status` and `migrate diff` are unaffected.
- **Only after C:** the runtime runs as `gms_app`, and the grant tests pass. The owner confirms the
  passwords were reset on non-production branches.

### Rollback

- **A and B:** revert the PR.
- **C2:**
  - point `DATABASE_URL` back to the `neondb_owner` credentials (one secret change);
  - the grants migration is additive and can be left in place;
  - roles can be dropped later.
- **C1** is not reversible and does not need to be: the old passwords simply stop working.

---

## G-3 — Exact CI endpoint allow-listing and actual target verification

### Root cause

`verify-ci-target` and `ci-cleanup` decide using:

- `NEON_BRANCH === "ci-testing"`, which the workflow itself sets, so it proves nothing;
- a **deny-list** of the development and production endpoints.

Any other endpoint passes. That includes the temporary branch, a recreated ci-testing endpoint, or
a new production endpoint if production's compute is ever replaced. Nothing asks the server which
branch it is. Integration and E2E tests open their own connections and are not covered by the check
at all.

### Proposed implementation

1. **Pin the CI target in the workflow** (committed, reviewed; not secrets):

   ```yaml
   DB_EXPECTED_BRANCH_ID: br-dawn-lake-bgrg54n5
   DB_EXPECTED_ENDPOINT_ID: ep-nameless-grass-bg6ppo3o
   ```

   The deny-list stays only as an extra layer.

2. **`verify-ci-target`** uses G-1's `verifyWriteTarget("ci", …)`:
   - both URLs' endpoint ids **equal** the expected endpoint;
   - the host pattern and TLS match;
   - the probe over **both** the pooled and the direct URL reports the expected branch id;
   - the expected id is never production's (registry).

   The log prints the server-reported IDs.

3. **`ci-cleanup`** runs the probe inside its deleting transaction, on the same connection:
   `BEGIN; SELECT current_setting('neon.branch_id', true)`. On mismatch it rolls back. Then it
   deletes.
4. **Test entry points check too:**
   - a Vitest `globalSetup` for the integration project;
   - Playwright `globalSetup` in DB mode.

   Each runs the same verification before any test can write, and fails the run on mismatch.
   Without a database configured they skip, as today.

5. **CI runs are bound to the pinned target.** Every database step re-verifies, so a secret swapped
   between steps is caught at the next step.

### Security guarantees

- The CI database job writes only to the branch whose **server-reported** id is
  `br-dawn-lake-bgrg54n5`, through endpoint `ep-nameless-grass-bg6ppo3o`.
- Any other endpoint or branch, including production, development and the temporary branch, makes
  the job **fail before the first write**. Probe failure also fails it.
- Cleanup cannot delete from the wrong branch, because the probe runs in the deleting transaction.

### Known limitations

- A PR that edits the workflow can change the pinned IDs. The mitigation is review, and optionally
  a `CODEOWNERS` rule on `.github/` and `known-targets.ts`.
- Secrets are not available to PRs from forks, which is good; same-repo branches can still use
  them.
- If Neon recreates the ci-testing endpoint, CI fails until a reviewed PR updates the pin. This is
  intended.
- The checks protect CI's own steps, not someone using the CI secret elsewhere (see G-2 C).

### Files affected

- `.github/workflows/ci.yml`;
- `scripts/verify-ci-target.ts`, `scripts/ci-cleanup.ts`;
- new `tests/integration/global-setup.ts` and `tests/e2e/global-setup.ts`;
- `vitest.config.ts` and `playwright.config.ts`;
- `docs/operations/ci-database.md`.

### Automated tests

- **Unit:**
  - CI policy: wrong endpoint, wrong branch from the probe, pooled and direct split, production id,
    missing expected variables, probe error;
  - cleanup's in-transaction verification with a fake client, which must roll back on mismatch.
- **CI itself:** the database job's log must show `verify-ci-target: OK — server branch
br-dawn-lake-bgrg54n5, endpoint ep-nameless-grass-bg6ppo3o (pooled and direct)`.
- **Negative check, one-off:** a throwaway PR sets a wrong `DB_EXPECTED_ENDPOINT_ID`. The job must
  fail at the identity step, with 0 database writes. It needs approval and is closed unmerged.

### Acceptance criteria

- Three consecutive green CI runs with the new checks.
- The negative check fails at the identity step.
- No change in test counts (unit 164+new, integration 38+new, E2E 84).

### Rollback

Revert the PR. The workflow returns to the label and deny-list checks.

---

## S-1 — ADR 0016 Step 1: re-read staff status and role on every request

### Root cause

`getStaffSession()` builds the staff identity entirely from the JWT. `role` comes from the token
created at sign-in, and `staff_users.active` is checked only at sign-in. Deactivation or a role
change therefore takes effect only when the token expires (8 h).

### Proposed implementation

1. `getStaffSession()` is wrapped in React `cache()`, so it runs once per request:
   - `auth()` returns the token's `sub`;
   - one primary-key query: `staffUser.findUnique({ where: { id }, select: { id, name, email, role,
active } })`;
   - it returns `null` if the row is missing, `active` is false or the role is invalid;
   - it returns **the database's** `role`, `name` and `email`. The token's `role` is ignored.
2. **Fail closed.** If the database lookup fails, it throws `AppError("SERVICE_UNAVAILABLE")`. It
   never falls back to the token's data:
   - pages show the error boundary;
   - server actions return a 503-type error;
   - the guards never grant access.
3. **No redirect loop.** `proxy.ts` still treats any valid cookie as signed in, and redirects
   `/login` → `/dashboard`. So a deactivated user with a live cookie must not be sent to `/login`.
   - `requireStaff` sends a cookie whose staff record is invalid to a new route handler,
     `/session-ended`.
   - That handler calls `signOut()` to clear the cookie, then redirects to `/login?ended=1`, which
     shows "Your session has ended. Please sign in again."
   - `assertStaff` throws `UNAUTHENTICATED`, as today.
4. **`proxy.ts` is unchanged**: an optimistic cookie gate with no database call. The `jwt`/`session`
   callbacks are unchanged, so nobody is forced to sign in again.
5. **No migration.** It does not depend on G-1 to G-3 and can ship as its own PR.

### Security guarantees

- On the **next request** after deactivation or a role change, every page, server action and
  service is affected:
  - a deactivated or deleted staff member is denied;
  - a downgraded role gets the new role's permissions.

  All 21 guarded files go through `getStaffSession()`.

- A forged or old token cannot give a role the database does not hold.

### Known limitations

- **Sign-out stays cookie-only.** A cookie copied before sign-out keeps working until expiry, as
  long as the person is still active. Per-session revocation and "sign out everywhere" come in
  ADR 0016 Step 2 with `auth_sessions`.
- A page already rendered in the browser stays visible until the next navigation or action. No new
  data is served after that.
- There is no staff-management screen yet. Deactivation is a script or database change until
  Phase 1D. Step 1 makes it effective once it is done.
- There is one extra indexed query per authorised request: a few ms near the database, about one
  round trip (~175 ms) from a local machine to Frankfurt.
- Authenticated pages need the database to load. The data screens already did.

### Files affected

- `src/server/auth/guards.ts`;
- new `src/app/(auth)/session-ended/route.ts`;
- the login page (message for `?ended=1`) and `src/i18n/*` strings in English and Kiswahili;
- `src/server/auth/redirects.ts`, only if `/session-ended` must bypass the proxy matcher;
- `tests/integration/guards.test.ts`;
- new `tests/e2e/session-revocation.spec.ts`;
- `tests/e2e/support/*`, for a guarded test helper that deactivates and reactivates an ephemeral
  test account;
- `.github/workflows/ci.yml`, which creates one more ephemeral account (`e2e.revoke@example.test`);
- `docs/decisions/0016-…`: Step 1 marked accepted and implemented after approval.

### Automated tests

- **Unit and integration, `guards.test.ts` with a mocked database:**
  - token role OWNER, database role TECHNICIAN → TECHNICIAN;
  - `active=false` → null, `assertStaff` throws 401, `requireStaff` redirects to `/session-ended`;
  - row missing → null;
  - database throws → `SERVICE_UNAVAILABLE`, never the token's data;
  - token without `sub` → null;
  - two guard calls in one request → exactly one query (memoised).
- **E2E (DB mode, `ci-testing` / temporary branch only):**
  - The ephemeral user signs in. The helper sets `active=false`, after verifying the branch
    identity. On the next navigation the user lands on `/login?ended=1`, with no redirect loop, and
    a server action is rejected.
  - The helper reactivates the account. The user must sign in again.
  - A role-change case: downgrade to TECHNICIAN, then Edit and Archive controls disappear on the
    next load.

### Acceptance criteria

- All of the above pass in CI, together with the existing suites.
- Owner and technician flows behave as before for active users.
- The CI log shows no extra failures and no flaky tests in 3 consecutive runs.

### Rollback

Revert the PR. Tokens are unchanged, so nobody has to sign in again in either direction.

---

## Delivery plan (after approval)

| PR  | Content                                                                          | Database changes                                                     | Depends on   |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| 1   | G-1 identity module + registry; G-3 CI pinning and probes; test global setup     | none                                                                 | —            |
| 2   | G-2 A+B: `prisma.config.ts` guard, `db-run` runner                               | none                                                                 | PR 1         |
| 3   | S-1 Step 1                                                                       | none (ephemeral CI account only)                                     | — (parallel) |
| —   | G-2 C1–C4: password resets, roles and grants, production pipeline, Neon controls | **credentials, roles, grants**: owner-approved runbook, step by step | PR 1–2       |

Each PR:

- is verified on a fresh temporary Neon branch copied from `development`, through the guarded
  runner, and on `ci-testing` in CI;
- is merged only by the owner.

Throughout: no production connection, no migrations outside `ci-testing` and the temporary branch,
no changes to `main`.

## Decisions requested

1. Approve PRs 1–3 as scoped, or change the scope.
2. Approve the G-2 C plan in principle, so I can write the step-by-step runbook. The credential
   changes themselves wait for separate approval.
3. Decide whether local tooling should keep any production override at all (5. under G-1), or
   whether production migrations should be possible **only** through a reviewed GitHub Actions
   environment. I recommend the latter.
4. Decide whether to add `CODEOWNERS` for `.github/`, `prisma/` and `src/server/db/known-targets.ts`.
