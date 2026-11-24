import { PageHeader } from "@/components/layout/page-header";
import { ModulePlaceholder } from "@/components/states/module-placeholder";
import { getTranslator } from "@/i18n/server";

/** Placeholder sections (not yet built). Copy lives in the i18n catalogue under `sections.*`. */
export type DashboardSectionKey =
  "bookings" | "calendar" | "technicians" | "serviceBays" | "reminders" | "settings";

export async function SectionPage({ section }: { section: DashboardSectionKey }) {
  const t = await getTranslator();
  const title = t(`sections.${section}.title`);
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={t(`sections.${section}.description`)} />
      <ModulePlaceholder
        title={t("sections.plannedTitle", { module: title })}
        intro={t("sections.plannedIntro")}
        plannedLabel={t("sections.plannedLabel")}
        badge={t("sections.comingLater")}
        plannedCapabilities={[...t.list(`sections.${section}.planned`)]}
      />
    </div>
  );
}

/** Localised page title for a placeholder section. */
export async function sectionTitle(section: DashboardSectionKey): Promise<string> {
  return (await getTranslator())(`sections.${section}.title`);
}
