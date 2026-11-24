# 0013 — Portal accounts and explicit per-customer access grants

- **Status:** Accepted (design). Amends 0011. Implemented in Phase 1C (portal); schema impact noted
  for 1B
- **Date:** 2026-11-24

## Context

The owner decided that several customers may share one phone number (D-05), and that verifying a
phone must not authorise access to every customer profile that uses it (D-06). ADR 0011 assumed a
verified contact resolves to one customer, so a session was "scoped to that customer". With shared
numbers, that would let anyone with the phone read every linked profile: a family member, a former
driver of a company vehicle, or the next holder of a recycled number.

## Decision

- **Separate the login identity from the customer.** `customer_portal_accounts` represents a person
  who proves control of a phone or email (unique per normalised value). It holds no customer data.
- **Explicit grants.** `customer_portal_access (portal_account_id, customer_id, role, granted_by,
granted_at, revoked_at)` is the **only** path from a portal session to customer data. Roles:
  `HOLDER` (individual), `COMPANY_ADMIN`, `COMPANY_VIEWER`.
- **Grants are never automatic.** A phone match does not create one. Grants are created by an
  audited staff action after an identity check, or later by an invitation an existing holder
  approves. Revocation is immediate (checked on every request).
- **Session flow:** OTP → session for the portal account → the person picks one of their granted
  customers (`active_customer_id`) → every query calls `assertCustomerAccess()`, which re-checks the
  grant. With zero grants the portal shows only "ask the garage to link your account".
- `customer_contacts` keeps per-customer phone/email records (shared numbers allowed). A contact's
  `verified_at` means the number was confirmed for that customer record. It is **not** an access
  grant.

## Consequences

- Staff need a "portal access" screen per customer (1C/1D) and a counter procedure for identity
  checks.
- Recycled numbers are contained: a new holder of a number gets no data without a grant.
- Phase 1B is unaffected in schema except that contact uniqueness is per customer, not global.
