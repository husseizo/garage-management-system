# 0011 — Customer identity, guest booking isolation and verification

- **Status:** Accepted (design), **amended by [0013](0013-customer-portal-access-grants.md)**. Implemented in Phases 1B–1C
- **Date:** 2026-11-24

## Context

Guests can book without an account (BR-02), customers later use `/track` and `/portal`, vehicles
change owners (BR-05), and booking references are shared over the phone and in messages.

## Decision

- **Guest booking stores a snapshot.** `booking_requests` keeps what the guest typed, with
  `customer_id = NULL`. The public flow never searches existing customers and returns the same
  response whether or not a match exists. Matching is an explicit, audited staff action.
- **Booking references are not credentials.** Tracking requires the reference **and** a one-time
  code sent to the contact on that request.
- **Customers authenticate by verified contact**, not password: OTP challenges (hashed, short
  expiry, attempt and rate limits) produce a server-side `auth_sessions` row (token hash only),
  revocable, with short idle/absolute lifetimes.
- **Scope by ownership.** Portal reads are limited to the session's `customer_id` and to vehicles
  the customer currently owns. Vehicle service history is visible to the current owner without
  earlier owners' personal or commercial data.
- Staff authentication stays on Auth.js (ADR 0004); customer sessions are separate so a customer
  session can never satisfy a staff guard.

## Consequences

- An SMS/email provider is required before `/track` and `/portal` work (Q-07).
- Duplicate customers are expected from guest bookings; the staff matching and merge tools (1B/1C)
  are part of the design, not an afterthought.
