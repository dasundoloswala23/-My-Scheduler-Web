import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextOccurrence } from "./recurrence.ts";

/** The same vectors as the Flutter app's test/recurrence_test.dart. */

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe("nextOccurrence", () => {
  it("a one-off task has no next date", () => {
    assert.equal(nextOccurrence(d(2026, 10, 5), "none"), null);
  });

  it("daily, weekly, monthly and yearly move by one unit", () => {
    assert.deepEqual(nextOccurrence(d(2026, 10, 5, 9), "daily"), d(2026, 10, 6, 9));
    assert.deepEqual(nextOccurrence(d(2026, 10, 5, 9), "weekly"), d(2026, 10, 12, 9));
    assert.deepEqual(nextOccurrence(d(2026, 10, 5, 9), "monthly"), d(2026, 11, 5, 9));
    assert.deepEqual(nextOccurrence(d(2026, 10, 5, 9), "yearly"), d(2027, 10, 5, 9));
  });

  it("weekdays skips the weekend", () => {
    const friday = d(2026, 10, 9);
    assert.equal(friday.getDay(), 5);
    assert.deepEqual(nextOccurrence(friday, "weekdays"), d(2026, 10, 12));
    assert.deepEqual(nextOccurrence(d(2026, 10, 6), "weekdays"), d(2026, 10, 7));
  });

  it("weekdays skips a weekend that crosses a month boundary", () => {
    const friday = d(2026, 10, 30, 9);
    assert.equal(friday.getDay(), 5);
    assert.deepEqual(nextOccurrence(friday, "weekdays"), d(2026, 11, 2, 9));
  });

  it("a series always moves forward", () => {
    for (const r of ["daily", "weekdays", "weekly", "monthly", "yearly"] as const) {
      const start = d(2026, 10, 5, 9);
      assert.ok(+nextOccurrence(start, r)! > +start, `${r} must advance`);
    }
  });
});

describe("month ends", () => {
  it("31 January becomes the last day of February, not 3 March", () => {
    assert.deepEqual(nextOccurrence(d(2027, 1, 31, 9), "monthly"), d(2027, 2, 28, 9));
  });

  it("in a leap year it becomes 29 February", () => {
    assert.deepEqual(nextOccurrence(d(2028, 1, 31, 9), "monthly"), d(2028, 2, 29, 9));
  });

  it("30 and 31 March both become 30 April", () => {
    assert.deepEqual(nextOccurrence(d(2027, 3, 30), "monthly"), d(2027, 4, 30));
    assert.deepEqual(nextOccurrence(d(2027, 3, 31), "monthly"), d(2027, 4, 30));
  });

  it("a day that exists in the next month is kept", () => {
    assert.deepEqual(nextOccurrence(d(2027, 4, 30), "monthly"), d(2027, 5, 30));
  });

  it("December rolls into January of the next year", () => {
    assert.deepEqual(nextOccurrence(d(2026, 12, 15, 8, 30), "monthly"), d(2027, 1, 15, 8, 30));
  });

  it("29 February repeats yearly on 28 February in a common year", () => {
    assert.deepEqual(nextOccurrence(d(2028, 2, 29), "yearly"), d(2029, 2, 28));
  });

  it("the time of day is untouched by clamping", () => {
    const next = nextOccurrence(d(2027, 1, 31, 17, 45), "monthly")!;
    assert.deepEqual([next.getHours(), next.getMinutes()], [17, 45]);
  });

  it("known limitation: a clamped monthly series stays on the lower day", () => {
    const feb = nextOccurrence(d(2027, 1, 31), "monthly")!;
    const mar = nextOccurrence(feb, "monthly")!;
    assert.deepEqual(mar, d(2027, 3, 28));
  });
});

describe("wall-clock time", () => {
  it("keeps 9:15 across a long run of days, including daylight-saving changes", () => {
    let date = d(2026, 1, 1, 9, 15);
    for (let i = 0; i < 400; i++) {
      date = nextOccurrence(date, "daily")!;
      assert.deepEqual([date.getHours(), date.getMinutes()], [9, 15], `drifted after ${i + 1} days`);
    }
  });

  it("weekly lands on the same weekday, a week on", () => {
    const next = nextOccurrence(d(2026, 10, 5), "weekly")!;
    assert.equal(next.getDay(), 1);
    assert.equal(next.getDate(), 12);
  });
});
