import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Brand } from "@/components/layout/brand";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { GlobalSearch } from "@/components/layout/global-search";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { visibleNav, type TranslatedNavGroup } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { I18nProvider } from "@/i18n/client";
import { getLocale, getTranslator } from "@/i18n/server";
import { requireStaff } from "@/server/auth/guards";

export const metadata: Metadata = {
  title: {
    default: `Dashboard · ${siteConfig.systemName}`,
    template: `%s · ${siteConfig.systemName}`,
  },
  robots: { index: false, follow: false },
};

/**
 * Garage dashboard shell. The layout verifies the session to build role-aware navigation; each
 * page performs its own permission check as well (layouts are not a security boundary).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [staff, t, locale] = await Promise.all([requireStaff(), getTranslator(), getLocale()]);
  const nav: TranslatedNavGroup[] = visibleNav(staff.role).map((group) => ({
    label: t(group.labelKey),
    items: group.items.map((item) => ({
      title: t(item.titleKey),
      href: item.href,
      icon: item.icon,
    })),
  }));
  const navLabel = t("nav.dashboard");

  return (
    <I18nProvider locale={locale}>
      <div className="bg-muted/30 flex min-h-dvh" lang={locale}>
        <aside className="bg-background sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex">
          <div className="flex h-16 items-center border-b px-4">
            <Brand href="/dashboard" />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <DashboardNav groups={nav} label={navLabel} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-background sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <DashboardMobileNav
                groups={nav}
                navLabel={navLabel}
                openLabel={t("nav.openNavigation")}
              />
              <GlobalSearch
                label={t("nav.globalSearch")}
                placeholder={t("nav.globalSearchPlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:block">
                <LocaleSwitcher
                  current={locale}
                  label={t("locale.label")}
                  names={{ en: t("locale.en"), sw: t("locale.sw") }}
                />
              </div>
              <UserMenu
                name={staff.name || staff.email}
                roleLabel={t(`roles.${staff.role}`)}
                labels={{ accountMenu: t("nav.accountMenu"), signOut: t("nav.signOut") }}
              />
            </div>
          </header>
          <div className="bg-background border-b px-4 py-2 sm:hidden">
            <LocaleSwitcher
              current={locale}
              label={t("locale.label")}
              names={{ en: t("locale.en"), sw: t("locale.sw") }}
            />
          </div>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </I18nProvider>
  );
}
