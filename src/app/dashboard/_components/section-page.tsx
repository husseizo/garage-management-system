import { PageHeader } from "@/components/layout/page-header";
import { ModulePlaceholder } from "@/components/states/module-placeholder";

import { dashboardSections, type DashboardSectionKey } from "./sections";

export function SectionPage({ section }: { section: DashboardSectionKey }) {
  const s = dashboardSections[section];
  return (
    <div className="space-y-6">
      <PageHeader title={s.title} description={s.description} />
      <ModulePlaceholder module={s.title} plannedCapabilities={[...s.planned]} />
    </div>
  );
}
