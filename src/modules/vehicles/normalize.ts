/**
 * Pure normalisation/validation for vehicle identifiers (business-rules §6). No I/O, unit tested.
 */

export type VinResult =
  | { ok: true; vin: string; checkDigitValid: boolean }
  | { ok: false; reason: "length" | "characters" };

const VIN_VALUES: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** ISO 3779 check digit (position 9). Many non-North-American VINs do not use it. */
export function vinCheckDigitValid(vin: string): boolean {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i]!;
    const value = /[0-9]/.test(ch) ? Number(ch) : VIN_VALUES[ch];
    if (value === undefined) return false;
    sum += value * VIN_WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  return vin[8] === (remainder === 10 ? "X" : String(remainder));
}

/** Upper-case and strip spaces/hyphens. I, O and Q are rejected, never "corrected". */
export function normalizeVin(input: string): VinResult {
  const vin = input.toUpperCase().replace(/[\s-]/g, "");
  if (vin.length !== 17) return { ok: false, reason: "length" };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { ok: false, reason: "characters" };
  return { ok: true, vin, checkDigitValid: vinCheckDigitValid(vin) };
}

export type PlateResult = { ok: true; plate: string; matchesUsualFormat: boolean } | { ok: false };

/**
 * Common Tanzanian private format: "T" + 3 digits + 3 letters (e.g. T123ABC). Other legitimate
 * formats (motorcycles "MC…", government "STK…", diplomatic, older series, foreign plates) exist,
 * so a mismatch is a WARNING only (owner decision J-03).
 */
const TZ_USUAL = /^T\d{3}[A-Z]{3}$/;

export function normalizePlate(input: string, countryCode = "TZ"): PlateResult {
  const plate = input.toUpperCase().replace(/[\s.\-]/g, "");
  if (!/^[A-Z0-9]{2,12}$/.test(plate)) return { ok: false };
  return { ok: true, plate, matchesUsualFormat: countryCode !== "TZ" || TZ_USUAL.test(plate) };
}

/** Lower-case "make model" used for trigram search; must match the DB CHECK. */
export function vehicleSearchText(make: string, model?: string | null): string {
  return `${make} ${model ?? ""}`.trim().toLowerCase();
}
