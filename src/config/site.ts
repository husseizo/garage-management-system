/**
 * Official branding confirmed by the owner (2026-11-24). Logo and brand colours have not been
 * supplied, so the neutral icon and design tokens (`src/app/globals.css`) remain. Contact details
 * and address are intentionally absent until the owner provides them.
 */
export const siteConfig = {
  /** Official business name. */
  name: "MAPESA GARAGE",
  /** Name of the software product (staff-facing). */
  systemName: "MAPESA GARAGE Management System",
  shortName: "MAPESA",
  description:
    "Servicing, mechanical repairs, diagnostics, bodywork and paint — book online and track your vehicle.",
  services: [
    {
      title: "General servicing",
      description: "Scheduled maintenance, oil and filter changes, inspections.",
    },
    {
      title: "Mechanical repairs",
      description: "Brakes, suspension, steering, clutch and engine work.",
    },
    { title: "Diagnostics", description: "Fault-code reading and electrical investigation." },
    {
      title: "Bodywork & accident repair",
      description: "Dent, panel and structural repair after collisions.",
    },
    {
      title: "Vehicle painting",
      description: "Colour-matched panel resprays and full refinishing.",
    },
  ],
} as const;
