/** Supported dashboard locales. English is the default (owner decision J-07). */
export const LOCALES = ["en", "sw"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "gms_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** BCP 47 tags for Intl formatting (dates, numbers). */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", sw: "sw-TZ" };
