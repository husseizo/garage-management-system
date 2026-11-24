/**
 * Copy for dashboard sections that are placeholders in Phase 0. Lists planned capabilities only —
 * never sample records or figures.
 */
export const dashboardSections = {
  bookings: {
    title: "Bookings",
    description: "Incoming booking requests and their status.",
    planned: [
      "Review and confirm guest booking requests",
      "Booking lifecycle: requested, confirmed, in progress, completed, cancelled",
      "Booking references for customer tracking",
    ],
  },
  calendar: {
    title: "Calendar",
    description: "Appointments across service bays and technicians.",
    planned: [
      "Day and week views by bay and technician",
      "Capacity-aware slot allocation",
      "Conflict detection when rescheduling",
    ],
  },
  customers: {
    title: "Customers",
    description: "Customer records and contact preferences.",
    planned: [
      "Customer profiles with contact details",
      "Communication consent and preferences",
      "Linked vehicles and booking history",
    ],
  },
  vehicles: {
    title: "Vehicles",
    description: "Vehicle records and service history.",
    planned: [
      "Registration, VIN, make, model and mileage",
      "Service and repair history",
      "Service-due tracking for reminders",
    ],
  },
  technicians: {
    title: "Technicians",
    description: "Technician skills and availability.",
    planned: [
      "Skills by service type (mechanical, diagnostics, body, paint)",
      "Working hours and time off",
      "Workload per day",
    ],
  },
  serviceBays: {
    title: "Service bays",
    description: "Workshop bays and what each can handle.",
    planned: [
      "Bay types (lift, diagnostics, body, paint booth)",
      "Bay availability and maintenance downtime",
      "Capacity inputs for smart scheduling",
    ],
  },
  reminders: {
    title: "Reminders",
    description: "Automated service reminders and their delivery.",
    planned: [
      "Time- and mileage-based reminder rules",
      "Email and SMS delivery with consent checks",
      "Delivery status and retry",
    ],
  },
  settings: {
    title: "Settings",
    description: "Garage profile, opening hours and staff accounts.",
    planned: [
      "Garage name, logo and brand colours",
      "Opening hours and holidays",
      "Staff accounts and roles",
    ],
  },
} as const;

export type DashboardSectionKey = keyof typeof dashboardSections;
