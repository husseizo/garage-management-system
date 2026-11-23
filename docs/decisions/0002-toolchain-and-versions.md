# 0002 — Toolchain and version pinning

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

The stack must be current and stable. Several "latest" npm tags on 2026-11-23 were not suitable:
`prisma@latest` pointed to an 8.0 release candidate, `typescript@latest` is the 7.x native compiler
(not yet the version Next.js scaffolds against), and Auth.js v5 is only published as `next-auth@beta`.

## Decision

Pin exact versions of framework-critical packages:

| Package                                        | Version           | Note                                                |
| ---------------------------------------------- | ----------------- | --------------------------------------------------- |
| Node.js                                        | 22 LTS (`.nvmrc`) | Prisma 7 rejects odd-numbered Node 23               |
| next / eslint-config-next                      | 16.4.6            | App Router, `proxy.ts` (replaces middleware)        |
| react / react-dom                              | 19.3.0            | Scaffolded by create-next-app 16.4.6                |
| typescript                                     | 5.9.3             | Strict mode; TS 7 deferred until Next.js targets it |
| tailwindcss                                    | 4.3.3             | CSS-first config in `globals.css`                   |
| shadcn (CLI)                                   | 4.23.0            | Radix base, new-york style, neutral palette         |
| prisma / @prisma/client / @prisma/adapter-neon | 7.10.1            | Latest stable, not 8.0 RC                           |
| @neondatabase/serverless                       | 1.2.1             | Driver for the Neon adapter                         |
| next-auth (Auth.js)                            | 5.0.0-beta.32     | Auth.js v5 is the App Router–native line            |
| zod                                            | 4.6.7             |                                                     |
| pino                                           | 10.4.0            |                                                     |
| vitest                                         | 5.1.1             |                                                     |
| @playwright/test                               | 1.65.1            |                                                     |
| eslint                                         | 9.39.5            | Next 16 flat config                                 |
| prettier                                       | 3.10.1            |                                                     |

`cacheComponents` is **disabled** for Phase 0. Almost every dashboard view is per-user and
request-time, and disabling it keeps auth redirects as real HTTP redirects. Revisit for the public
marketing pages once they carry real content.

## Consequences

- Upgrades are deliberate PRs, not drift. Renovate/Dependabot can be enabled to propose them.
- Auth.js is a beta release; we accept this because v4 does not integrate with the App Router as
  cleanly. Isolation behind `src/server/auth/` limits the blast radius of API changes.
- `npm audit` reports a high-severity ReDoS in `effect`, a transitive dependency of the Prisma CLI's
  config loader. It is not reachable from user input at runtime; track the Prisma fix.
