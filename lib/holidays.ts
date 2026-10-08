import type { Holiday } from "./types";

/**
 * Holiday data and filtering.
 *
 * This is a direct port of the Flutter app's `HolidayData` / `HolidayService`,
 * and is deliberately kept in step with it: both clients read the same country
 * and category preferences, so they must derive the same dates from them or a
 * user would see different holidays on their phone and in the browser.
 *
 * Dates are computed per year rather than listed, so the tables do not expire.
 * Lunar holidays (Poya days, Eid, Diwali) cannot be derived from a civil rule
 * and are deliberately absent; users add those by hand.
 */

export type HolidayCategoryId =
  | "public"
  | "bank"
  | "mercantile"
  | "national"
  | "religious"
  | "observance";

export const HOLIDAY_CATEGORIES: { id: HolidayCategoryId; label: string; plural: string }[] = [
  { id: "public", label: "Public holiday", plural: "Public holidays" },
  { id: "bank", label: "Bank holiday", plural: "Bank holidays" },
  { id: "mercantile", label: "Mercantile holiday", plural: "Mercantile holidays" },
  { id: "national", label: "National holiday", plural: "National holidays" },
  { id: "religious", label: "Religious holiday", plural: "Religious holidays" },
  { id: "observance", label: "Observance", plural: "Observances" },
];

export function holidayCategoryLabel(id: string): string {
  return HOLIDAY_CATEGORIES.find((c) => c.id === id)?.label ?? "Holiday";
}

export interface HolidayCountry {
  code: string;
  name: string;
  flag: string;
}

export const HOLIDAY_COUNTRIES: HolidayCountry[] = [
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
];

export function holidayCountry(code: string): HolidayCountry | undefined {
  return HOLIDAY_COUNTRIES.find((c) => c.code === code);
}

/**
 * One holiday on one date. Calendar metadata, deliberately not a Task: it has
 * no board, list, position or drag behaviour, so it can never collide with the
 * task drag-and-drop system.
 */
export interface HolidayEntry {
  id: string;
  countryCode: string;
  date: Date;
  name: string;
  category: HolidayCategoryId;
  source: "builtIn" | "user";
}

// ------------------------------------------------------------------ helpers

/** The nth `weekday` of a month, 1-based. Sunday is 0, matching `getDay()`. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month - 1, last.getDate() - offset);
}

/** The Monday strictly before `date`; a Monday steps back a full week. */
function mondayBefore(date: Date): Date {
  const back = (date.getDay() - 1 + 7) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - (back === 0 ? 7 : back));
}

/** Gregorian Easter Sunday (Anonymous Gregorian / Meeus algorithm). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function entry(
  countryCode: string,
  date: Date,
  name: string,
  category: HolidayCategoryId,
): HolidayEntry {
  return {
    // Stable and derivable, so the same holiday keeps its identity between
    // renders without anything being written to the database.
    id: `builtin:${countryCode}:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${name}`,
    countryCode,
    date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    name,
    category,
    source: "builtIn",
  };
}

// ---------------------------------------------------------------- countries

const MONDAY = 1;
const THURSDAY = 4;

function sriLanka(year: number): HolidayEntry[] {
  const e = easter(year);
  return [
    entry("LK", new Date(year, 0, 15), "Tamil Thai Pongal Day", "public"),
    entry("LK", new Date(year, 1, 4), "Independence Day", "national"),
    entry("LK", addDays(e, -2), "Good Friday", "religious"),
    entry("LK", new Date(year, 3, 13), "Day before Sinhala & Tamil New Year", "public"),
    entry("LK", new Date(year, 3, 14), "Sinhala & Tamil New Year", "public"),
    entry("LK", new Date(year, 4, 1), "May Day", "mercantile"),
    entry("LK", new Date(year, 9, 5), "World Teachers' Day", "observance"),
    entry("LK", new Date(year, 11, 25), "Christmas Day", "public"),
  ];
}

function unitedStates(year: number): HolidayEntry[] {
  return [
    entry("US", new Date(year, 0, 1), "New Year's Day", "public"),
    entry("US", nthWeekday(year, 1, MONDAY, 3), "Martin Luther King Jr. Day", "public"),
    entry("US", nthWeekday(year, 2, MONDAY, 3), "Presidents' Day", "public"),
    entry("US", lastWeekday(year, 5, MONDAY), "Memorial Day", "public"),
    entry("US", new Date(year, 5, 19), "Juneteenth", "public"),
    entry("US", new Date(year, 6, 4), "Independence Day", "national"),
    entry("US", nthWeekday(year, 9, MONDAY, 1), "Labor Day", "public"),
    entry("US", nthWeekday(year, 10, MONDAY, 2), "Columbus Day", "observance"),
    entry("US", new Date(year, 10, 11), "Veterans Day", "public"),
    entry("US", nthWeekday(year, 11, THURSDAY, 4), "Thanksgiving", "public"),
    entry("US", new Date(year, 11, 25), "Christmas Day", "public"),
  ];
}

function unitedKingdom(year: number): HolidayEntry[] {
  const e = easter(year);
  return [
    entry("GB", new Date(year, 0, 1), "New Year's Day", "bank"),
    entry("GB", addDays(e, -2), "Good Friday", "bank"),
    entry("GB", addDays(e, 1), "Easter Monday", "bank"),
    entry("GB", nthWeekday(year, 5, MONDAY, 1), "Early May bank holiday", "bank"),
    entry("GB", lastWeekday(year, 5, MONDAY), "Spring bank holiday", "bank"),
    entry("GB", lastWeekday(year, 8, MONDAY), "Summer bank holiday", "bank"),
    entry("GB", new Date(year, 11, 25), "Christmas Day", "bank"),
    entry("GB", new Date(year, 11, 26), "Boxing Day", "bank"),
  ];
}

function india(year: number): HolidayEntry[] {
  return [
    entry("IN", new Date(year, 0, 26), "Republic Day", "national"),
    entry("IN", new Date(year, 7, 15), "Independence Day", "national"),
    entry("IN", new Date(year, 9, 2), "Gandhi Jayanti", "national"),
    entry("IN", new Date(year, 11, 25), "Christmas Day", "public"),
  ];
}

function australia(year: number): HolidayEntry[] {
  const e = easter(year);
  return [
    entry("AU", new Date(year, 0, 1), "New Year's Day", "public"),
    entry("AU", new Date(year, 0, 26), "Australia Day", "national"),
    entry("AU", addDays(e, -2), "Good Friday", "public"),
    entry("AU", addDays(e, 1), "Easter Monday", "public"),
    entry("AU", new Date(year, 3, 25), "Anzac Day", "national"),
    entry("AU", new Date(year, 11, 25), "Christmas Day", "public"),
    entry("AU", new Date(year, 11, 26), "Boxing Day", "public"),
  ];
}

function canada(year: number): HolidayEntry[] {
  const e = easter(year);
  return [
    entry("CA", new Date(year, 0, 1), "New Year's Day", "public"),
    entry("CA", addDays(e, -2), "Good Friday", "public"),
    entry("CA", mondayBefore(new Date(year, 4, 25)), "Victoria Day", "public"),
    entry("CA", new Date(year, 6, 1), "Canada Day", "national"),
    entry("CA", nthWeekday(year, 9, MONDAY, 1), "Labour Day", "public"),
    entry("CA", nthWeekday(year, 10, MONDAY, 2), "Thanksgiving", "public"),
    entry("CA", new Date(year, 10, 11), "Remembrance Day", "observance"),
    entry("CA", new Date(year, 11, 25), "Christmas Day", "public"),
    entry("CA", new Date(year, 11, 26), "Boxing Day", "bank"),
  ];
}

const BUILDERS: Record<string, (year: number) => HolidayEntry[]> = {
  LK: sriLanka,
  US: unitedStates,
  GB: unitedKingdom,
  IN: india,
  AU: australia,
  CA: canada,
};

/** Every built-in holiday for the given countries across the given years. */
export function builtInHolidays(countryCodes: string[], years: number[]): HolidayEntry[] {
  const out: HolidayEntry[] = [];
  for (const code of countryCodes) {
    const build = BUILDERS[code];
    if (!build) continue; // An unknown code contributes nothing rather than throwing.
    for (const year of years) out.push(...build(year));
  }
  return out;
}

function fromUserHoliday(h: Holiday): HolidayEntry {
  const allowed = HOLIDAY_CATEGORIES.map((c) => c.id) as string[];
  return {
    id: h.id,
    countryCode: h.countryCode ?? "",
    date: new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate()),
    name: h.name,
    category: (allowed.includes(h.category) ? h.category : "public") as HolidayCategoryId,
    source: "user",
  };
}

/**
 * The holidays to show, filtered by the user's countries and categories and
 * sorted by date. User-added holidays always show, whatever countries are
 * selected, because the user asked for them explicitly.
 */
export function holidaysForYears(
  years: number[],
  options: {
    countries: string[];
    categories: string[];
    userHolidays?: Holiday[];
  },
): HolidayEntry[] {
  const enabled = new Set(options.categories);
  const wantedYears = new Set(years);

  const builtIn = builtInHolidays(options.countries, years).filter((h) =>
    enabled.has(h.category),
  );
  const mine = (options.userHolidays ?? [])
    .filter((h) => wantedYears.has(h.date.getFullYear()))
    .map(fromUserHoliday);

  return [...builtIn, ...mine].sort((a, b) => +a.date - +b.date);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Holidays grouped by day, so a week or month view generates the year's table
 * once instead of once per cell.
 */
export function holidaysByDay(
  days: Date[],
  options: { countries: string[]; categories: string[]; userHolidays?: Holiday[] },
): Record<string, HolidayEntry[]> {
  const years = Array.from(new Set(days.map((d) => d.getFullYear())));
  const wanted = new Set(days.map(dayKey));
  const out: Record<string, HolidayEntry[]> = {};

  for (const h of holidaysForYears(years, options)) {
    const key = dayKey(h.date);
    if (!wanted.has(key)) continue;
    (out[key] ??= []).push(h);
  }
  return out;
}

/** Looks a day up in the map returned by `holidaysByDay`. */
export function holidaysOn(
  map: Record<string, HolidayEntry[]>,
  day: Date,
): HolidayEntry[] {
  return map[dayKey(day)] ?? [];
}
