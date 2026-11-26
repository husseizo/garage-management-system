# 0017 — Database target identity for every write tool (G-1, G-3)

- **Status:** Accepted (owner approved Phase 1C-0 PRs 1–3, 2026-11-26). Implemented in Phase 1C-0
  PR 1
- **Date:** 2026-11-26
- **Relates to:** ADR 0003 (Neon + Prisma), ADR 0009 (migration conventions), `docs/operations/ci-database.md`,
  `docs/progress/phase-1c-0-proposal.md`

## Context

Before this change, local write tools (`db-guard`, `staff:create`, `garage:profile`, `db:dry-run`)
refused only when the self-declared `NEON_BRANCH` label was a production name. They allowed
everything when the label was unset, so they failed open. CI checked the same label, which the
workflow sets itself, plus a deny-list of two endpoints. Nothing asked the database which branch it
actually was.

## Decision

Every tool that writes calls `verifyWriteTarget(action, env, { connections })`
(`src/server/db/identity.ts`). It refuses unless **all** of these agree:

1. **Connection strings.**
   - Each is a PostgreSQL URL on a `*.neon.tech` host with `sslmode=require` or stricter.
   - The pooled string has a `-pooler` host and the direct one does not.
   - All strings the tool uses share **one** endpoint id and database.
2. **Expected target.** There are two ways to name it:
   - The registry `src/server/db/known-targets.ts` holds non-secret IDs and changes only by a
     reviewed PR. The target is chosen by the **exact** endpoint id. An unregistered endpoint is
     refused.
   - A temporary branch is declared with **both** `DB_EXPECTED_BRANCH_ID` and
     `DB_EXPECTED_ENDPOINT_ID`. It may not reuse a registered name, branch or endpoint, and
     `ci-cleanup` is never allowed on it.
3. **Action allowed on the target.** Each registry entry lists its write actions. Production lists
   none.
4. **Labels only refuse.** If `NEON_BRANCH` / `NEON_BRANCH_ID` are set, they must match the target.
   `NEON_BRANCH` must be set at all, because the pure pre-check `assertWritableTarget` fails
   closed. A label can never make an unknown target acceptable.
5. **The server-reported identity.** On every connection the tool will use, the tool runs `SELECT
current_setting('neon.branch_id', true), current_database(), current_user`. The branch id must
   equal the target's. Null, a mismatch, an error or a timeout (30 s) all refuse.
6. **Production.** The only allowed action is `migrate-deploy`, and only when all of these hold:
   - `ALLOW_PRODUCTION_DB_WRITES=true`;
   - `CONFIRM_PRODUCTION_BRANCH_ID` is the exact production branch id;
   - the job is not a pull-request CI job.

   The probe then proves the server really is production. Running it still requires separate owner
   approval.

**CI** (`verifyCiTarget`):

- The workflow pins `DB_EXPECTED_BRANCH_ID=br-dawn-lake-bgrg54n5` and
  `DB_EXPECTED_ENDPOINT_ID=ep-nameless-grass-bg6ppo3o`, which must equal the registry's
  `ci-testing` entry.
- Both the pooled and the direct string are required and verified.
- `CI_FORBIDDEN_ENDPOINTS` stays as an extra layer, not as proof of identity.

`ci-cleanup` repeats the identity query **inside the transaction that deletes**. The Vitest
integration project and Playwright DB mode run the verification in their global setup, before any
test can write.

## Consequences

- A wrong or missing label, a copied production URL, an unregistered or recreated endpoint, a
  pooled/direct mix-up or an unreachable server all stop the tool before it writes.
- If Neon ever recreates an endpoint, every write tool refuses until a reviewed PR updates the
  registry and the workflow pin. This is intended.
- **Limitations.**
  - These guards protect **our tools only**. Anyone holding valid credentials can still connect
    with `psql`, the Neon Console or the Neon API.
  - A hostile non-Neon server could fake `neon.branch_id`. The defence combines it with the
    TLS-verified Neon host and the exact endpoint match.
  - Credential separation and least-privilege roles (proposal G-2 part C) are the measures that
    address direct access. They need separate owner approval.
- **Prisma CLI (G-2 A, Phase 1C-0 PR 2).** `prisma.config.ts` exports an async config that
  classifies the Prisma command (`src/server/db/prisma-command.ts`). It runs for **every** Prisma
  command, so typing `npx prisma …` cannot skip the guard:
  - `migrate deploy|dev|resolve`, `db execute`, `studio` and any unknown command run
    `verifyWriteTarget` first;
  - `migrate reset`, `db push` and `db seed` are always refused;
  - read-only commands are unchanged;
  - a non-CLI loader, such as an editor extension, gets no connection string.

  The `db:migrate:*` npm scripts call Prisma directly, and `db:guard` remains as a standalone
  check. This replaces the marker and runner proposed in G-2 B: verification now happens in the
  same process that connects, with no hand-over step. Editing `prisma.config.ts` or using another
  client still bypasses it.
