import {
  Bell,
  CalendarDays,
  Car,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { DashboardNavIcon } from "@/config/navigation";

const ICONS: Record<DashboardNavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  bookings: ClipboardList,
  calendar: CalendarDays,
  customers: Users,
  vehicles: Car,
  technicians: Wrench,
  bays: Warehouse,
  reminders: Bell,
  settings: Settings,
};

export function NavIcon({ name, className }: { name: DashboardNavIcon; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
