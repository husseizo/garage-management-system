/** Locale- and time-zone-aware formatting helpers (garage time zone from the garage profile). */
export function formatDate(
  date: Date | string | null | undefined,
  intlLocale: string,
  timeZone: string,
) {
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone }).format(
    new Date(date),
  );
}

export function formatDateTime(
  date: Date | string | null | undefined,
  intlLocale: string,
  timeZone: string,
) {
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(date));
}

/** Display an E.164 number with light grouping, e.g. +255 712 345 678. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+255(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+255 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
