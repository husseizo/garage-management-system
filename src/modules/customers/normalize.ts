import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

/**
 * Pure normalisation helpers for customer data (business-rules §6). No I/O, unit tested.
 */
export type PhoneResult = { ok: true; e164: string } | { ok: false };

/**
 * Normalise a phone number to E.164 using the garage's country as the default region.
 * Tanzanian examples: "0712 345 678", "712345678", "255712345678", "+255 712 345 678" → "+255712345678".
 */
export function normalizePhone(input: string, defaultRegion: string): PhoneResult {
  const raw = input.trim();
  if (!raw || raw.length > 32) return { ok: false };
  const region = defaultRegion.toUpperCase() as CountryCode;
  const parsed = parsePhoneNumberFromString(raw, region);
  if (!parsed || !parsed.isValid()) return { ok: false };
  return { ok: true, e164: parsed.number };
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Collapse internal whitespace and trim; empty → undefined. */
export function cleanText(input: string | null | undefined): string | undefined {
  const v = (input ?? "").replace(/\s+/g, " ").trim();
  return v ? v : undefined;
}

/** TIN as stored: upper-case, separators removed (e.g. "123-456-789" → "123456789"). */
export function normalizeTaxId(input: string | null | undefined): string | undefined {
  const v = (input ?? "").toUpperCase().replace(/[\s.\-/]/g, "");
  return v ? v : undefined;
}

export function buildDisplayName(
  input:
    | { kind: "INDIVIDUAL"; givenName?: string | null; familyName?: string | null }
    | { kind: "COMPANY"; companyName: string },
): string {
  if (input.kind === "COMPANY") return input.companyName.trim();
  return [input.givenName, input.familyName].filter(Boolean).join(" ").trim();
}
