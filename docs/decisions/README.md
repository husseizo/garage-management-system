# Architecture Decision Records

Each ADR captures one significant technical decision: the context, the decision, and its consequences.
ADRs are immutable once accepted — supersede them with a new ADR rather than editing history.

| #    | Title                                                                                            | Status                             |
| ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 0001 | [Modular monolith on Next.js App Router](0001-modular-monolith.md)                               | Accepted                           |
| 0002 | [Toolchain and version pinning](0002-toolchain-and-versions.md)                                  | Accepted                           |
| 0003 | [Neon PostgreSQL with Prisma ORM](0003-neon-prisma.md)                                           | Accepted                           |
| 0004 | [Staff authentication with Auth.js](0004-staff-authentication.md)                                | Accepted                           |
| 0005 | [Layered server-side authorization](0005-authorization-boundaries.md)                            | Accepted                           |
| 0006 | [Validated configuration and structured logging](0006-config-and-logging.md)                     | Accepted                           |
| 0007 | [Testing strategy](0007-testing-strategy.md)                                                     | Accepted                           |
| 0008 | [Identifiers and time representation](0008-identifiers-and-time.md)                              | Accepted                           |
| 0009 | [Migration safety and data-integrity conventions](0009-migration-and-integrity-conventions.md)   | Accepted                           |
| 0010 | [Prevent double booking with exclusion constraints](0010-scheduling-concurrency.md)              | Accepted (design)                  |
| 0011 | [Customer identity, guest isolation and verification](0011-customer-identity-and-access.md)      | Accepted (design), amended by 0013 |
| 0012 | [Append-only audit log](0012-append-only-audit-log.md)                                           | Accepted                           |
| 0013 | [Portal accounts and explicit per-customer access grants](0013-customer-portal-access-grants.md) | Accepted (design)                  |
| 0014 | [Dashboard localisation (English default, Kiswahili)](0014-localization.md)                      | Accepted                           |
| 0015 | [Database-backed rate limiting](0015-rate-limiting.md)                                           | Accepted (revised 2026-11-25)      |
| 0016 | [Server-side revocation of staff sessions](0016-staff-session-revocation.md)                     | Step 1 accepted; Step 2 proposed   |
| 0017 | [Database target identity for every write tool](0017-database-target-identity.md)                | Accepted                           |

Template: copy `0000-template.md`.
