# Database credentials and permissions plan (G-2 part C)

- **Status:** **Proposed — awaiting owner approval. Nothing in part C has been done.** No password
  has been rotated, no role created, no grant changed, no GitHub secret touched. (G-2 part A, the
  Prisma CLI guard, is completed; see section 0.)
- **Date:** 2026-11-26
- **Rule:** every step marked **[approval]** is a separate owner decision. A step starts only after
  the owner approves it in chat, and the result is verified before the next step is proposed.
- **Relates to:** ADR 0017, ADR 0018 (proposed release process), `docs/progress/phase-1c-0-proposal.md`

## 0. State at Phase 1C-0 closure (`develop` = `d4ad427`, CI run `45798150572`)

G-2 has three parts in the Phase 1C-0 proposal:

- A is the guard inside `prisma.config.ts`;
- B is a separate guarded runner, which was **superseded** by A because Prisma 7 accepts an async
  config, so B was not built;
- C is credentials and permissions (this plan).

| Part / control                                                                                     | State                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **G-2 A:** every Prisma CLI command goes through the identity guard in `prisma.config.ts` (PR #11) | **Completed and verified.** CI printed `db-guard: OK — prisma migrate deploy on branch "ci-testing" br-dawn-lake-bgrg54n5 (server-reported)` |
| Server-reported branch id checked before every scripted write and in CI (PR #10, G-1/G-3)          | **Completed and verified**, including a negative test that failed closed (run `45785429993`)                                                 |
| **G-2 C:** rotate the inherited `neondb_owner` passwords (C1, D1, T1, P1)                          | **Not started.** Proposed below; each step needs separate approval                                                                           |
| **G-2 C:** `gms_app` least-privilege role (C2–C4, D2, P2)                                          | **Not started**                                                                                                                              |
| **G-2 C:** identity checks also assert `current_user` per action                                   | **Not started**                                                                                                                              |
| **G-2 C:** project-scoped Neon key for release backups (P3)                                        | **Not started**                                                                                                                              |

**What the completed guards do not cover.** They stop the project's own tooling from writing to the
wrong branch. They cannot stop someone who holds a valid credential from connecting directly, with
`psql` or any client, and running any SQL that role allows. Only part C reduces that exposure.

## 1. Current state (read-only facts)

| Branch                                              | Parent      | Roles used                                | Where the credential lives today                                                        |
| --------------------------------------------------- | ----------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| production `br-still-bar-bgjl83o4`                  | —           | `neondb_owner`                            | Neon only (fetched on demand with the owner's Neon CLI login; never stored in the repo) |
| development `br-wild-river-bgrlfo90`                | production  | `neondb_owner` for runtime and migrations | Owner's `.env` (git-ignored)                                                            |
| ci-testing `br-dawn-lake-bgrg54n5`                  | production  | `neondb_owner` for everything             | GitHub secrets `NEON_CI_DATABASE_URL` and `NEON_CI_DATABASE_URL_UNPOOLED`               |
| verify-phase-1b-20261125 `br-morning-tree-bg5opwfi` | development | `neondb_owner`                            | `.env.verify.local` (git-ignored, mode 600)                                             |

**Inherited credentials.**

- Neon copies a parent branch's roles, with their passwords, when it creates a branch.
- `development` and `ci-testing` were both branched from `production`, and the temporary branch
  from `development`.
- So, unless a password was reset since, **one `neondb_owner` password may be valid on all four
  branches**. Anyone holding the development or CI credential could then reach production by
  changing only the hostname.
- This has **not been tested**, because testing it means connecting to production. The plan
  removes the risk without testing it.

**Other facts.**

- `neondb_owner` owns every table and has DDL rights. The application runtime does not need them.
- The owner's Neon API key, used by the Neon CLI on this machine, can read or reset **any**
  branch's credentials. It is the master credential.
- Nothing in the app or the tests needs DDL. One test (append-only `audit_logs`) expects SQLSTATE
  `42501` from the trigger. It must keep running as the owner/migrator role, so it still tests the
  trigger rather than a missing grant.

## 2. Target roles

| Role                             | Used by                                                                                             | Rights                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `neondb_owner` (rotated)         | Migrations, and break-glass access                                                                  | Owner of all objects. Used **only** for `prisma migrate`, `db:dry-run`, and the trigger tests                                                                                                                                                                                                          |
| `gms_app`                        | App runtime (pooled), `staff:create`, `garage:profile`, `ci-cleanup`, E2E and integration DML tests | `CONNECT` on the database, `USAGE` on schema `public`; `SELECT, INSERT, UPDATE, DELETE` on business tables and `rate_limit_buckets`; **only `SELECT, INSERT` on `audit_logs`**; `USAGE, SELECT` on sequences; nothing on `_prisma_migrations`; no `TRUNCATE`, `REFERENCES`, `TRIGGER`, `CREATE` or DDL |
| `gms_migrator` (optional, later) | Replaces `neondb_owner` for migrations                                                              | Owns the schema through `REASSIGN OWNED`. Only worth doing if `neondb_owner` must keep other duties                                                                                                                                                                                                    |

**How `gms_app` is created.**

- With SQL (`CREATE ROLE gms_app LOGIN`), run by the owner in `psql`, with the password set
  through `\password` so it is never typed into a command line or a log.
- **Not** through the Neon Console or API. Roles created there join `neon_superuser`, which gives
  more rights than the app needs.
- Each branch gets its own `gms_app` password.

**Grants.**

- They come from an idempotent, identity-guarded script, `scripts/db-grant-app-role.ts`, with a new
  registry action `grant-roles`. Not from a Prisma migration: a migration would fail on any branch
  where the role does not exist yet.
- The script also sets `ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public`, so tables
  added by future migrations get the same grants. `audit_logs` is re-restricted explicitly.
- CI then checks the grants, as in step C4.

## 3. Staged sequence

Each stage is small and verifiable. It starts with the least critical branch and touches
production last.

### Stage C: ci-testing (isolated; CI verifies it)

| Step | Action                                                                                                                                                                                                                                                                                                                                                                                                        | Who                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| C1   | **[approval]** Reset `neondb_owner`'s password on `ci-testing` (Neon Console, or `POST …/branches/br-dawn-lake-bgrg54n5/roles/neondb_owner/reset_password`). Then pipe the new strings straight into `gh secret set NEON_CI_DATABASE_URL` and `NEON_CI_DATABASE_URL_UNPOOLED`; they are never displayed. Re-run CI on `develop`: the identity line must show `br-dawn-lake-bgrg54n5` and every test must pass | Owner runs it; Claude verifies              |
| C2   | **[approval]** Create `gms_app` on `ci-testing` (owner, `psql`, `\password`). Run `db-grant-app-role` against ci-testing                                                                                                                                                                                                                                                                                      | Owner, then Claude runs the script          |
| C3   | **[approval]** Add secrets `NEON_CI_APP_DATABASE_URL` (pooled, `gms_app`). Keep `NEON_CI_DATABASE_URL_UNPOOLED` (owner) for migrations and the trigger tests. A workflow PR sends the app, E2E and DML scripts through `gms_app`, and migrations, drift and the trigger tests through the owner role                                                                                                          | Owner sets the secret; Claude writes the PR |
| C4   | CI grant test (new). As `gms_app`, these must fail with `42501`: `CREATE TABLE`, `DROP TABLE`, `TRUNCATE`, `ALTER TABLE`, `UPDATE`/`DELETE` on `audit_logs`, any access to `_prisma_migrations`. Normal DML must succeed                                                                                                                                                                                      | Claude (code)                               |

### Stage D: development

| Step | Action                                                                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1   | **[approval]** Reset `neondb_owner`'s password on `development`. The owner updates `.env` with `neon connection-string … > ` redirected into the file; it is never shown. Verify with `npm run db:guard`, a read-only identity check, and `npm run dev` with a sign-in                                         |
| D2   | **[approval]** Create `gms_app` on development and run the grant script. `.env` then splits: `DATABASE_URL` uses `gms_app` (pooled), and `DATABASE_URL_UNPOOLED` keeps the owner role (direct) for `migrate dev`. Verify: the app works, the grant test passes on development, and `db:guard` shows both roles |

### Stage T: temporary verification branch

| Step | Action                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | **[approval]** Either delete `br-morning-tree-bg5opwfi` (it has served its purpose and holds a copy of the inherited credential), or reset its `neondb_owner` password and update `.env.verify.local`. **Recommendation: delete it** once the owner no longer needs to inspect it. Future verification branches are created from development **after** D1, so they inherit the new password, not production's |

### Stage P: production (last, and only once the release process of ADR 0018 is approved)

| Step | Action                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | **[approval]** Reset `neondb_owner`'s password on production. This **invalidates every copy that was inherited by other branches** before their own resets. Production has no consumers yet, so nothing breaks. Store the new direct string **only** as the `production` environment secret `NEON_PROD_MIGRATOR_URL_UNPOOLED`, piped from the Neon CLI into `gh secret set --env production` |
| P2   | **[approval]** Create `gms_app` on production, then run the grant script through the release workflow, or a one-off approved environment job. Never from a laptop. Store the pooled string in the hosting platform's secret store when hosting is chosen, and as `NEON_PROD_APP_URL` for the release smoke test                                                                              |
| P3   | **[approval]** Create a project-scoped Neon API key for the release workflow's backup step, stored as an environment secret. The owner's personal key stays on the owner's machine only                                                                                                                                                                                                      |
| P4   | Verify through the release workflow's dry-run path:<br>- identity probe as the migrator: `br-still-bar-bgjl83o4`;<br>- `SELECT 1` as `gms_app`;<br>- `gms_app` DDL refused.<br>No migration runs during this check                                                                                                                                                                           |

**Order and reasoning.**

- C1 before D1 before T1 before P1. Each non-production reset breaks that branch's link to the
  production password.
- P1 then kills the original production password itself.
- After P1, no credential that ever existed outside Neon is valid on production.

## 4. Credential storage

| Credential                           | Stored in                                                                   | Never in                            |
| ------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------- |
| Production migrator (`neondb_owner`) | GitHub environment `production` secret                                      | Laptops, `.env`, repo secrets, chat |
| Production app (`gms_app`)           | Hosting secret store; `production` environment secret (smoke test)          | Laptops, chat                       |
| CI owner and CI app                  | GitHub **repository** secrets, available to same-repo PRs only, never forks | Logs (Actions masks them), files    |
| Development owner and app            | Owner's `.env` (git-ignored, mode 600)                                      | Commits, chat, issues               |
| Neon personal API key                | Neon CLI credential store on the owner's machine                            | CI, repo                            |
| Neon project-scoped key (backups)    | `production` environment secret                                             | Everywhere else                     |

Neon itself is the source of truth: any lost credential is replaced by a reset, not recovered. A
password manager entry is optional.

## 5. Connectivity verification after every step

- `npm run db:guard`, or the CI identity step, prints the server-reported branch id, the endpoint
  and `current_user`. They must be the expected branch **and** the expected role.
- **Application role:** health endpoint `ok`, sign-in works, and the grant test passes.
- **Migration role:** `prisma migrate status` reports up to date.
- **Old credential:** the owner may confirm it is now rejected (`password authentication failed`),
  on non-production branches only.

## 6. Rollback and recovery

| Change                           | Rollback                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password reset                   | Not reversible, and it need not be. If the new secret was stored wrongly, **reset again** and store it again. Affected consumers fail closed (no connection) until then |
| Switching consumers to `gms_app` | Point the secret or `.env` back at the owner role. Keep that secret until the new setup has run green for one week. Code needs no change                                |
| Grants too narrow                | Re-run the grant script with the fix, through a PR. Normally there is no need to fall back to the owner role                                                            |
| Remove `gms_app`                 | `REASSIGN OWNED BY gms_app TO neondb_owner; DROP OWNED BY gms_app; DROP ROLE gms_app;` (it owns nothing by design)                                                      |
| Lost production migrator         | Reset on production (owner, Neon Console), then update the environment secret. This needs no data operation                                                             |

## 7. Code work this plan implies (each its own PR, after approval)

1. `scripts/db-grant-app-role.ts` plus the registry action `grant-roles`, which is identity-guarded
   and idempotent.
2. A CI workflow that splits the app and owner credentials, plus the grant test (C3, C4).
3. Identity checks that also assert the expected `current_user` per action: the app role for
   runtime and DML scripts, the owner role for migrations.
4. Docs: `ci-database.md`, `.env.example`.

## 8. Limitations

- Least privilege limits what a **leaked application credential** can do. It does not limit the
  owner credential, the migrator, or the Neon API key. Those must stay rare and offline as
  described above.
- `gms_app` still has `UPDATE` and `DELETE` on business tables, because the app needs them. Audit
  rows and the append-only trigger stay the record of what changed.
- The Neon project owner account can always reset or read everything. Protect it with 2FA.
