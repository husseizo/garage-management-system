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
  title: string;
  href: string;
  icon: DashboardNavIcon;
  /** Restrict visibility to these roles. Omitted = all staff. Pages enforce the same rule. */
  roles?: readonly StaffRole[];
}

export interface DashboardNavGroup {
  label: string;
  items: DashboardNavItem[];
}

export const dashboardNav: DashboardNavGroup[] = [
  {
    label: "Workshop",
    items: [
      { title: "Overview", href: "/dashboard", icon: "overview" },
      { title: "Bookings", href: "/dashboard/bookings", icon: "bookings" },
      { title: "Calendar", href: "/dashboard/calendar", icon: "calendar" },
    ],
  },
  {
    label: "Records",
    items: [
      { title: "Customers", href: "/dashboard/customers", icon: "customers" },
      { title: "Vehicles", href: "/dashboard/vehicles", icon: "vehicles" },
    ],
  },
  {
    label: "Resources",
    items: [
      { title: "Technicians", href: "/dashboard/technicians", icon: "technicians" },
      { title: "Service bays", href: "/dashboard/service-bays", icon: "bays" },
      { title: "Reminders", href: "/dashboard/reminders", icon: "reminders" },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "Settings",
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
