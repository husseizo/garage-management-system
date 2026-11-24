import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { DEFAULT_LOCALE, INTL_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { MESSAGES } from "./messages";
import { createTranslator, type Translator } from "./translate";

/** Current dashboard locale from the `gms_locale` cookie; English when unset or invalid. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export const getTranslator = cache(async (): Promise<Translator> => {
  const locale = await getLocale();
  return createTranslator(MESSAGES[locale], MESSAGES[DEFAULT_LOCALE]);
});

export async function getIntlLocale(): Promise<string> {
  return INTL_LOCALE[await getLocale()];
}
