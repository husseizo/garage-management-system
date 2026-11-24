/** Pure date helpers for garage-local calendar dates (no I/O; unit tested). */

/** Offset (ms) of `timeZone` from UTC at instant `at`. */
export function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" in the garage time zone for instant `at`. */
export function localDateString(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Instant of local midnight for calendar date `ymd` ("YYYY-MM-DD") in `timeZone`. */
export function startOfLocalDay(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const offset = timeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

/**
 * Effective instant for a staff-entered calendar date: today (or empty) → now, so the change is
 * ordered after anything recorded earlier today; a past date → that day's local midnight.
 */
export function effectiveInstant(
  ymd: string | undefined,
  timeZone: string,
  now = new Date(),
): Date {
  if (!ymd || ymd === localDateString(now, timeZone)) return now;
  return startOfLocalDay(ymd, timeZone);
}
