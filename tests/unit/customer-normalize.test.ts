import { describe, expect, it } from "vitest";

import {
  buildDisplayName,
  cleanText,
  normalizeEmail,
  normalizePhone,
  normalizeTaxId,
} from "@/modules/customers/normalize";
import { contactInputSchema, customerInputSchema } from "@/modules/customers/schemas";

describe("normalizePhone (TZ default region)", () => {
  it.each(["0712 345 678", "712345678", "255712345678", "+255 712 345 678", "+255-712-345-678"])(
    "%s → +255712345678",
    (input) => {
      expect(normalizePhone(input, "TZ")).toEqual({ ok: true, e164: "+255712345678" });
    },
  );

  it("accepts Tanzanian landlines and explicit international numbers", () => {
    expect(normalizePhone("022 212 3456", "TZ")).toEqual({ ok: true, e164: "+255222123456" });
    expect(normalizePhone("+254 712 345678", "TZ")).toEqual({ ok: true, e164: "+254712345678" });
  });

  it.each(["", "12345", "0712", "abc", "+255 1234", "0".repeat(40)])("rejects %j", (input) => {
    expect(normalizePhone(input, "TZ").ok).toBe(false);
  });
});

describe("other normalisers", () => {
  it("lower-cases and trims email", () => {
    expect(normalizeEmail("  Asha@Example.COM ")).toBe("asha@example.com");
  });
  it("cleans text and TIN", () => {
    expect(cleanText("  Asha   Mussa ")).toBe("Asha Mussa");
    expect(cleanText("   ")).toBeUndefined();
    expect(normalizeTaxId("123-456-789")).toBe("123456789");
  });
  it("builds display names by kind", () => {
    expect(buildDisplayName({ kind: "INDIVIDUAL", givenName: "Asha", familyName: "Mussa" })).toBe(
      "Asha Mussa",
    );
    expect(buildDisplayName({ kind: "INDIVIDUAL", familyName: "Mussa" })).toBe("Mussa");
    expect(buildDisplayName({ kind: "COMPANY", companyName: " Kilimo Ltd " })).toBe("Kilimo Ltd");
  });
});

describe("customer schemas", () => {
  it("requires a name for individuals and a company name for companies", () => {
    const ind = customerInputSchema.safeParse({
      kind: "INDIVIDUAL",
      givenName: " ",
      familyName: "",
    });
    expect(ind.success).toBe(false);
    expect(ind.error?.issues[0]?.message).toBe("validation.nameRequired");
    const co = customerInputSchema.safeParse({ kind: "COMPANY", companyName: "" });
    expect(co.error?.issues.map((i) => i.message)).toContain("validation.companyNameRequired");
  });

  it("TIN is optional for companies and validated when present", () => {
    expect(
      customerInputSchema.safeParse({ kind: "COMPANY", companyName: "Kilimo Ltd" }).success,
    ).toBe(true);
    const ok = customerInputSchema.parse({
      kind: "COMPANY",
      companyName: "Kilimo Ltd",
      taxId: "123-456-789",
    });
    expect(ok.kind === "COMPANY" && ok.taxId).toBe("123456789");
    const bad = customerInputSchema.safeParse({ kind: "COMPANY", companyName: "K", taxId: "12" });
    expect(bad.error?.issues[0]?.message).toBe("validation.invalidTaxId");
  });

  it("ignores TIN-like fields on individuals and defaults language to Kiswahili", () => {
    const r = customerInputSchema.parse({
      kind: "INDIVIDUAL",
      givenName: "Asha",
      taxId: "123456789",
    });
    expect("taxId" in r).toBe(false);
    expect(r.preferredLanguage).toBe("sw");
  });

  it("parses the duplicate confirmation checkbox", () => {
    expect(
      customerInputSchema.parse({ kind: "INDIVIDUAL", givenName: "A", confirmDuplicates: "on" })
        .confirmDuplicates,
    ).toBe(true);
    expect(
      customerInputSchema.parse({ kind: "INDIVIDUAL", givenName: "A" }).confirmDuplicates,
    ).toBe(false);
  });

  it("contact input requires a value", () => {
    expect(contactInputSchema.safeParse({ kind: "PHONE", value: "" }).success).toBe(false);
    expect(contactInputSchema.parse({ kind: "EMAIL", value: " a@b.co " }).value).toBe("a@b.co");
  });
});
