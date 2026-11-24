import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Brand } from "@/components/layout/brand";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { visibleNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
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
 * page performs its own `requireStaff()` check as well (layouts are not a security boundary).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const nav = visibleNav(staff.role);

  return (
    <div className="bg-muted/30 flex min-h-dvh">
      <aside className="bg-background sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <Brand href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <DashboardNav groups={nav} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <DashboardMobileNav groups={nav} />
            <span className="text-muted-foreground text-sm lg:hidden">Dashboard</span>
          </div>
          <UserMenu name={staff.name || staff.email} role={staff.role} />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
