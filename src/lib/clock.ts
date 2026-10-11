// Every "now" in Moot goes through this module. A household's clock is the real
// time plus its clock_offset_ms, which is how Demo mode fast-forwards time.

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const DAY_MS = 24 * 60 * 60 * 1000;

export function householdNow(h: { clock_offset_ms: number }, realNow = Date.now()): number {
  return realNow + (h.clock_offset_ms || 0);
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
  dateKey: string; // YYYY-MM-DD in the household's time zone
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "long",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "America/New_York";
  try {
    formatter(tz);
    return tz;
  } catch {
    return "America/New_York";
  }
}

export function localParts(ms: number, tz: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) parts[p.type] = p.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const weekday = WEEKDAYS.indexOf(parts.weekday.toLowerCase() as Weekday);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return { year, month, day, hour, minute, weekday, dateKey };
}

/** Offset of the time zone from UTC at the given instant, in ms. */
function tzOffset(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(ms / 60000) * 60000;
}

/** Converts a wall-clock time in a time zone to a UTC timestamp. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - tzOffset(guess, tz);
  const corrected = guess - tzOffset(result, tz);
  if (corrected !== result) result = corrected;
  return result;
}

export function parseTime(time: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * The next instant strictly after `fromMs` when it is `time` on `weekday`
 * (or on any day when weekday is null) in the given time zone.
 */
export function nextOccurrence(
  fromMs: number,
  tz: string,
  weekday: number | null,
  hour: number,
  minute: number,
): number {
  const p = localParts(fromMs, tz);
  for (let i = 0; i <= 8; i++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    const wd = d.getUTCDay();
    if (weekday !== null && wd !== weekday) continue;
    const candidate = zonedTimeToUtc(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      hour,
      minute,
      tz,
    );
    if (candidate > fromMs) return candidate;
  }
  throw new Error("No next occurrence found");
}

/** Whole days since Monday 5 January 1970, counted on the household's calendar. */
export function localDayNumber(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return Math.floor((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(1970, 0, 5)) / DAY_MS);
}

export function formatDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function formatClock(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatTimeOfDay(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
