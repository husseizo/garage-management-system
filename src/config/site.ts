/**
 * Neutral branding placeholders. Replace once the garage supplies its official name, logo and
 * colours (colours live as design tokens in `src/app/globals.css`).
 */
export const siteConfig = {
  name: "Garage Management System",
  shortName: "GMS",
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
