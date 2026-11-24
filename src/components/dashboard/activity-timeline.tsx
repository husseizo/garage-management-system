import { History } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/i18n/format";
import type { Translator } from "@/i18n/translate";
import type { ActivityItem } from "@/server/activity";

/** Read-only audit-based timeline (who, what, when; field names only). */
export function ActivityTimeline({
  items,
  t,
  intlLocale,
  timeZone,
}: {
  items: ActivityItem[];
  t: Translator;
  intlLocale: string;
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden />
          {t("activity.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("activity.empty")}</p>
        ) : (
          <ol className="space-y-3" aria-label={t("activity.title")}>
            {items.map((item) => (
              <li key={item.id} className="border-l-2 pl-3">
                <p className="text-sm font-medium">
                  {t.dynamic(`activity.actions.${item.action}`, item.action)}
                </p>
                <p className="text-muted-foreground text-xs">
                  <time dateTime={item.occurredAt.toISOString()}>
                    {formatDateTime(item.occurredAt, intlLocale, timeZone)}
                  </time>{" "}
                  ·{" "}
                  {item.actorName
                    ? t("activity.by", { name: item.actorName })
                    : t("activity.system")}
                </p>
                {item.fields.length ? (
                  <p className="text-muted-foreground text-xs">
                    {t("activity.fieldsChanged", {
                      fields: item.fields
                        .map((f) => t.dynamic(`activity.fields.${f}`, f))
                        .join(", "),
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
