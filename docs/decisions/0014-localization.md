# 0014 — Dashboard localisation (English default, Kiswahili)

- **Status:** Accepted. Implemented in Phase 1B
- **Date:** 2026-11-24

## Context

Owner decision J-07: the dashboard supports English and Kiswahili, English by default, with
centralised resources and no hard-coded translations in components. Next.js 16 App Router, mostly
server components; a few client components (forms, pickers).

## Decision

- **No i18n framework dependency.** A small typed layer in `src/i18n`:
  `messages/en.ts` defines the shape; `messages/sw.ts` must satisfy the same type (missing or extra
  keys fail `tsc`). `t(key, params)` keys are type-checked dotted paths. `t.list()` handles string
  lists, and `t.dynamic()` handles runtime keys such as audit actions.
- **Locale from a cookie** (`gms_locale`, `en` | `sw`, default `en`), set by a server action from
  the language switcher. URLs are not localised, because the dashboard is private and not indexed.
- **Server components** call `getTranslator()`. **Client components** use `useT()` from an
  `I18nProvider` mounted by the dashboard layout and the sign-in page.
- **Validation and errors** carry message **keys** (Zod messages and `AppError.publicMessage` in the
  customer and vehicle modules), translated at render time.
- Dates use `Intl` with the garage time zone (`garage_profile.timezone`) and `en-GB` / `sw-TZ`.
- Unit tests enforce key parity, placeholder parity and no untranslated long sentences.

## Consequences

- Both catalogues ship to the browser (a few KB). That is acceptable for a staff dashboard.
- The public site stays English until a later phase.
- Kiswahili strings are a first draft and need native-speaker review at MAPESA GARAGE.
