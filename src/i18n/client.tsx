"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_LOCALE, type Locale } from "./config";
import { MESSAGES } from "./messages";
import { createTranslator, type Translator } from "./translate";

const I18nContext = createContext<{ locale: Locale; t: Translator } | null>(null);

/** Provides translations to client components. The server decides the locale. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(
    () => ({ locale, t: createTranslator(MESSAGES[locale], MESSAGES[DEFAULT_LOCALE]) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translator {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT() must be used inside <I18nProvider>");
  return ctx.t;
}

export function useLocale(): Locale {
  return useContext(I18nContext)?.locale ?? DEFAULT_LOCALE;
}
