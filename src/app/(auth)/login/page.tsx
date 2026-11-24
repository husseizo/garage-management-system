import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getTranslator } from "@/i18n/server";
import { safeCallbackPath } from "@/server/auth/redirects";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("auth.signInTitle"), robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const [{ callbackUrl }, t, locale] = await Promise.all([
    searchParams,
    getTranslator(),
    getLocale(),
  ]);
  const safe = safeCallbackPath(Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl);

  return (
    <I18nProvider locale={locale}>
      <main className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12">
        <Brand />
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <h1 className="text-lg">{t("auth.signInTitle")}</h1>
            </CardTitle>
            <CardDescription>
              {t("auth.signInDescription", { system: siteConfig.systemName })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={safe} />
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-sm">
          {t("auth.customerHint")}{" "}
          <Link href="/" className="text-foreground underline underline-offset-4">
            {t("auth.returnToSite")}
          </Link>
        </p>
        <LocaleSwitcher
          current={locale}
          label={t("locale.label")}
          names={{ en: t("locale.en"), sw: t("locale.sw") }}
        />
      </main>
    </I18nProvider>
  );
}
