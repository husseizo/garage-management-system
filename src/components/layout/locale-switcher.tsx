import { Languages } from "lucide-react";

import { LOCALES, type Locale } from "@/i18n/config";
import { setLocaleAction } from "@/i18n/actions";
import { cn } from "@/lib/utils";

/** Language toggle (no client JS): each option is a submit button posting to a server action. */
export function LocaleSwitcher({
  current,
  label,
  names,
}: {
  current: Locale;
  label: string;
  names: Record<Locale, string>;
}) {
  return (
    <form action={setLocaleAction} className="flex items-center gap-1 text-sm" aria-label={label}>
      <Languages className="text-muted-foreground size-4" aria-hidden />
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          value={locale}
          aria-pressed={locale === current}
          lang={locale}
          className={cn(
            "focus-visible:ring-ring rounded px-2 py-1 outline-none focus-visible:ring-2",
            locale === current
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {names[locale]}
        </button>
      ))}
    </form>
  );
}
