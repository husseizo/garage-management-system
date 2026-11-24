import type { MessageKey } from "@/i18n/translate";
import type { StaffRole } from "@/modules/staff/roles";

export type DashboardNavIcon =
  | "overview"
  | "bookings"
  | "calendar"
  | "customers"
  | "vehicles"
  | "technicians"
  | "bays"
  | "reminders"
  | "settings";

export interface DashboardNavItem {
  /** i18n key; translated by the dashboard layout. */
  titleKey: MessageKey;
  href: string;
  icon: DashboardNavIcon;
  /** Restrict visibility to these roles. Omitted = all staff. Pages enforce the same rule. */
  roles?: readonly StaffRole[];
}

export interface DashboardNavGroup {
  labelKey: MessageKey;
  items: DashboardNavItem[];
}

/** Navigation after translation, as passed to client components. */
export interface TranslatedNavGroup {
  label: string;
  items: { title: string; href: string; icon: DashboardNavIcon }[];
}

export const dashboardNav: DashboardNavGroup[] = [
  {
    labelKey: "nav.groups.workshop",
    items: [
      { titleKey: "nav.items.overview", href: "/dashboard", icon: "overview" },
      { titleKey: "nav.items.bookings", href: "/dashboard/bookings", icon: "bookings" },
      { titleKey: "nav.items.calendar", href: "/dashboard/calendar", icon: "calendar" },
    ],
  },
  {
    labelKey: "nav.groups.records",
    items: [
      { titleKey: "nav.items.customers", href: "/dashboard/customers", icon: "customers" },
      { titleKey: "nav.items.vehicles", href: "/dashboard/vehicles", icon: "vehicles" },
    ],
  },
  {
    labelKey: "nav.groups.resources",
    items: [
      { titleKey: "nav.items.technicians", href: "/dashboard/technicians", icon: "technicians" },
      { titleKey: "nav.items.serviceBays", href: "/dashboard/service-bays", icon: "bays" },
      { titleKey: "nav.items.reminders", href: "/dashboard/reminders", icon: "reminders" },
    ],
  },
  {
    labelKey: "nav.groups.administration",
    items: [
      {
        titleKey: "nav.items.settings",
        href: "/dashboard/settings",
        icon: "settings",
        roles: ["OWNER", "MANAGER"],
      },
    ],
  },
];

export const publicNav = [
  { title: "Book a service", href: "/book" },
  { title: "Track a booking", href: "/track" },
  { title: "My vehicles", href: "/portal" },
] as const;

export function visibleNav(role: StaffRole): DashboardNavGroup[] {
  return dashboardNav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Active-state matching: exact for the overview, prefix for sections. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
