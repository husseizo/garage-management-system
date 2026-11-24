import { describe, expect, it } from "vitest";

import {
  normalizePlate,
  normalizeVin,
  vehicleSearchText,
  vinCheckDigitValid,
} from "@/modules/vehicles/normalize";
import { newVehicleSchema, transferOwnershipSchema } from "@/modules/vehicles/schemas";

describe("VIN", () => {
  it("normalises case, spaces and hyphens", () => {
    expect(normalizeVin(" 1m8gdm9a-xkp 042788 ")).toEqual({
      ok: true,
      vin: "1M8GDM9AXKP042788",
      checkDigitValid: true,
    });
  });

  it("flags a check-digit mismatch as a warning, not an error", () => {
    const r = normalizeVin("JTDKB20U093123456");
    expect(r.ok).toBe(true);
    expect(r.ok && r.checkDigitValid).toBe(vinCheckDigitValid("JTDKB20U093123456"));
  });

  it.each([
    ["too short", "1M8GDM9AXKP04278", "length"],
    ["too long", "1M8GDM9AXKP0427888", "length"],
    ["contains I", "1M8GDM9AXKP04278I", "characters"],
    ["contains O", "1M8GDM9AXKP0427O8", "characters"],
    ["contains Q", "QM8GDM9AXKP042788", "characters"],
  ])("rejects a VIN that is %s", (_label, vin, reason) => {
    expect(normalizeVin(vin)).toEqual({ ok: false, reason });
  });
});

describe("registration plates (warning-only format, J-03)", () => {
  it("normalises and recognises the usual Tanzanian format", () => {
    expect(normalizePlate("t 123 abc")).toEqual({
      ok: true,
      plate: "T123ABC",
      matchesUsualFormat: true,
    });
  });

  it.each(["MC 123 ABC", "STK 1234", "SU 1234", "T.123-AB"])(
    "accepts unusual but legitimate %s with a warning",
    (p) => {
      const r = normalizePlate(p);
      expect(r.ok).toBe(true);
      expect(r.ok && r.matchesUsualFormat).toBe(false);
    },
  );

  it("does not warn for non-TZ registrations", () => {
    expect(normalizePlate("KDA 123A", "KE")).toEqual({
      ok: true,
      plate: "KDA123A",
      matchesUsualFormat: true,
    });
  });

  it.each(["", "A", "T 123 ABC !", "ABCDEFGHIJKLM"])("rejects %j", (p) => {
    expect(normalizePlate(p).ok).toBe(false);
  });

  it("search text matches the database CHECK expression", () => {
    expect(vehicleSearchText("Toyota", "Land Cruiser")).toBe("toyota land cruiser");
    expect(vehicleSearchText("Toyota", null)).toBe("toyota");
  });
});

describe("vehicle schemas", () => {
  it("requires make, validates year, keeps VIN optional", () => {
    expect(newVehicleSchema.safeParse({ make: "" }).error?.issues[0]?.message).toBe(
      "validation.required",
    );
    expect(
      newVehicleSchema.safeParse({ make: "Toyota", modelYear: "1800" }).error?.issues[0]?.message,
    ).toBe("validation.invalidYear");
    const r = newVehicleSchema.parse({ make: "Toyota", modelYear: "", vin: "", fuelType: "" });
    expect(r).toMatchObject({
      make: "Toyota",
      modelYear: undefined,
      vin: undefined,
      fuelType: undefined,
    });
  });

  it("transfer requires a customer UUID and a valid date", () => {
    expect(transferOwnershipSchema.safeParse({ toCustomerId: "" }).error?.issues[0]?.message).toBe(
      "validation.customerRequired",
    );
    const bad = transferOwnershipSchema.safeParse({
      toCustomerId: "018f0000-0000-7000-8000-000000000000",
      effectiveAt: "24/11/2026",
    });
    expect(bad.error?.issues[0]?.message).toBe("validation.invalidDate");
  });
});
