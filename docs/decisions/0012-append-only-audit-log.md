# 0012 — Append-only audit log referencing entities by value

- **Status:** Accepted. Implemented in Phase 1A
- **Date:** 2026-11-24

## Context

BR-14 requires audit history for financial and workshop records, and security events need a
tamper-resistant trail. Audit rows must survive soft deletes, anonymisation and table evolution,
and cover every module.

## Decision

- One table, `audit_logs`, written in the **same transaction** as the change it describes.
- Entities are referenced **by value** (`entity_type`, `entity_id text`) without FKs. This is the
  only deliberate polymorphic reference in the schema: a per-table FK would block anonymisation and
  purges and would need a column per table.
- The **actor** is a real FK: `actor_staff_user_id → staff_users` ON DELETE RESTRICT, with a CHECK
  tying it to `actor_type`. A customer actor column is added in 1B.
- **Append-only in the database:** BEFORE UPDATE/DELETE (row) and BEFORE TRUNCATE (statement)
  triggers raise `42501`. Retention purges run only as an owner-approved maintenance procedure.
- `changes` holds redacted `{field: {from, to}}` objects. Secrets, hashes, OTPs and full contact
  values are never written.

## Consequences

- Staff who have acted cannot be hard-deleted; they are deactivated (already the Phase 0 practice).
- The table grows without bound; partition by year when volume justifies it (roadmap).
- Anyone with table-owner privileges could still drop the trigger. Production access stays limited
  to the deployment role and owner-approved procedures.
