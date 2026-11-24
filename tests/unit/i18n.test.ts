import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { en } from "@/i18n/messages/en";
import { sw } from "@/i18n/messages/sw";
import { createTranslator, interpolate } from "@/i18n/translate";

function shape(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [`${prefix}:string`];
  if (Array.isArray(node)) return [`${prefix}:list(${node.length})`];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    shape(v, `${prefix}.${k}`),
  );
}

describe("i18n catalogues", () => {
  it("English is the default locale", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(isLocale("sw")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("Kiswahili has exactly the same keys and list lengths as English", () => {
    expect(shape(sw).sort()).toEqual(shape(en).sort());
  });

  it("no Kiswahili string is left empty or identical to a long English sentence", () => {
    const enLeaves = shape(en);
    expect(enLeaves.length).toBeGreaterThan(200);
    const flat = (n: unknown): string[] =>
      typeof n === "string" ? [n] : Array.isArray(n) ? n : Object.values(n as object).flatMap(flat);
    const swStrings = flat(sw);
    const enStrings = new Set(flat(en).filter((s) => s.split(" ").length > 4));
    expect(swStrings.every((s) => s.trim().length > 0)).toBe(true);
    expect(swStrings.filter((s) => enStrings.has(s))).toEqual([]);
  });

  it("placeholders match between locales", () => {
    const placeholders = (n: unknown, p = ""): string[] =>
      typeof n === "string"
        ? [
            `${p}:${[...n.matchAll(/\{(\w+)\}/g)]
              .map((m) => m[1])
              .sort()
              .join(",")}`,
          ]
        : Array.isArray(n)
          ? []
          : Object.entries(n as object).flatMap(([k, v]) => placeholders(v, `${p}.${k}`));
    expect(placeholders(sw)).toEqual(placeholders(en));
  });
});

describe("translator", () => {
  const t = createTranslator(sw, en);

  it("translates and interpolates", () => {
    expect(t("nav.items.customers")).toBe("Wateja");
    expect(t("overview.welcomeName", { name: "Asha" })).toBe("Karibu, Asha");
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("resolves dotted audit action keys and falls back for unknown dynamic keys", () => {
    expect(t.dynamic("activity.actions.customer.created", "x")).toBe("Mteja amesajiliwa");
    expect(t.dynamic("activity.actions.unknown.thing", "unknown.thing")).toBe("unknown.thing");
  });

  it("returns planned-capability lists", () => {
    expect(t.list("sections.bookings.planned")).toHaveLength(3);
  });
});
