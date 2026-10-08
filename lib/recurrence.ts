import type { Recurrence } from "./types";

/**
 * The date of the occurrence after `from`, or null when the task does not
 * repeat. A port of the Flutter app's `nextOccurrence` (lib/core/recurrence.dart);
 * the test vectors are the same, so the two cannot drift apart unnoticed.
 *
 * Dates advance by CALENDAR arithmetic, never by adding hours:
 *  - adding 24 hours lands an hour off across a daylight-saving change, so a
 *    9:00 daily task would become 8:00 or 10:00. Building a new local Date from
 *    year, month and day keeps 9:00.
 *  - adding a month to 31 January must not become 3 March. The day is clamped to
 *    the length of the target month, so 31 January becomes 28 (or 29) February.
 *
 * Known limitation, shared with the Flutter app: a monthly task started on the
 * 31st drifts once it has been clamped (31 Jan, 28 Feb, 28 Mar), because only
 * the current date is stored, not the day the series started on.
 */
export function nextOccurrence(from: Date, recurrence: Recurrence): Date | null {
  switch (recurrence) {
    case "none":
      return null;
    case "daily":
      return addDays(from, 1);
    case "weekdays": {
      let next = addDays(from, 1);
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
      return next;
    }
    case "weekly":
      return addDays(from, 7);
    case "monthly":
      return addMonths(from, 1);
    case "yearly":
      return addMonths(from, 12);
  }
}

/** `days` later on the calendar, at the same wall-clock time. */
function addDays(d: Date, days: number): Date {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}

/** `months` later, with the day clamped to the length of the target month. */
function addMonths(d: Date, months: number): Date {
  const zeroBased = d.getMonth() + months;
  const year = d.getFullYear() + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(
    year,
    month,
    Math.min(d.getDate(), lastDay),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}
