import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  builtInHolidays,
  holidaysByDay,
  holidaysForYears,
  holidaysOn,
  HOLIDAY_GROUPS,
  groupIsOn,
  toggleGroup,
  holidayCountry,
  type HolidayEntry,
} from "./holidays.ts";
import type { Holiday } from "./types.ts";

/**
 * These assertions are deliberately identical to the Flutter app's
 * `test/holiday_test.dart`. The two clients read the same country and category
 * preferences, so if they ever derive different dates from them a user sees
 * different holidays on their phone and in the browser. This file is the thing
 * that catches that.
 */

const ALL_CATEGORIES = [
  "public",
  "bank",
  "mercantile",
  "national",
  "religious",
  "observance",
];

function named(entries: HolidayEntry[], name: string): HolidayEntry {
  const match = entries.find((e) => e.name === name);
  assert.ok(match, `expected a holiday called "${name}"`);
  return match;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function userHoliday(partial: Partial<Holiday> & { date: Date; name: string }): Holiday {
  return {
    id: "mine",
    region: "",
    countryCode: "",
    category: "public",
    ...partial,
  };
}

describe("built-in holiday dates", () => {
  it("places fixed-date holidays on their date", () => {
    const lk = builtInHolidays(["LK"], [2026]);
    assert.equal(ymd(named(lk, "Independence Day").date), "2026-2-4");
    assert.equal(ymd(named(lk, "May Day").date), "2026-5-1");
  });

  it("moves nth-weekday holidays with the year", () => {
    // US Thanksgiving is the fourth Thursday of November.
    const cases: [number, string][] = [
      [2024, "2024-11-28"],
      [2025, "2025-11-27"],
      [2026, "2026-11-26"],
    ];
    for (const [year, expected] of cases) {
      const us = builtInHolidays(["US"], [year]);
      assert.equal(ymd(named(us, "Thanksgiving").date), expected);
    }
  });

  it("places last-weekday holidays in the right week", () => {
    // US Memorial Day is the last Monday of May.
    assert.equal(ymd(named(builtInHolidays(["US"], [2026]), "Memorial Day").date), "2026-5-25");
    assert.equal(ymd(named(builtInHolidays(["US"], [2027]), "Memorial Day").date), "2027-5-31");
  });

  it("derives Easter-based holidays from Easter", () => {
    // Easter Sunday 2026 is 5 April.
    const gb = builtInHolidays(["GB"], [2026]);
    assert.equal(ymd(named(gb, "Good Friday").date), "2026-4-3");
    assert.equal(ymd(named(gb, "Easter Monday").date), "2026-4-6");
  });

  it("puts Victoria Day on the Monday strictly before 25 May", () => {
    // 25 May 2026 is itself a Monday, the case a naive rule gets wrong.
    assert.equal(new Date(2026, 4, 25).getDay(), 1);
    assert.equal(ymd(named(builtInHolidays(["CA"], [2026]), "Victoria Day").date), "2026-5-18");
  });

  it("ignores an unknown country rather than throwing", () => {
    assert.deepEqual(builtInHolidays(["ZZ"], [2026]), []);
  });

  it("gives a holiday the same id on every call", () => {
    const first = builtInHolidays(["LK"], [2026]).map((e) => e.id);
    const second = builtInHolidays(["LK"], [2026]).map((e) => e.id);
    assert.deepEqual(first, second);
  });
});

describe("holiday filtering", () => {
  it("shows nothing when no country is selected", () => {
    const result = holidaysForYears([2026], { countries: [], categories: ALL_CATEGORIES });
    assert.deepEqual(result, []);
  });

  it("shows both countries when two are selected", () => {
    const result = holidaysForYears([2026], {
      countries: ["LK", "US"],
      categories: ALL_CATEGORIES,
    });
    assert.deepEqual([...new Set(result.map((h) => h.countryCode))].sort(), ["LK", "US"]);
  });

  it("removes only the unticked country's holidays", () => {
    const result = holidaysForYears([2026], {
      countries: ["LK"],
      categories: ALL_CATEGORIES,
    });
    assert.deepEqual([...new Set(result.map((h) => h.countryCode))], ["LK"]);
  });

  it("hides the categories that are switched off", () => {
    const result = holidaysForYears([2026], {
      countries: ["LK"],
      categories: ["public"],
    });
    assert.deepEqual([...new Set(result.map((h) => h.category))], ["public"]);
    assert.ok(!result.some((h) => h.name === "World Teachers' Day"));
  });

  it("always shows a user's own holiday, whatever countries are selected", () => {
    const result = holidaysForYears([2026], {
      countries: [],
      categories: ["public"],
      userHolidays: [userHoliday({ name: "Poya", date: new Date(2026, 2, 3) })],
    });
    assert.deepEqual(result.map((h) => h.name), ["Poya"]);
    assert.equal(result[0].source, "user");
  });

  it("sorts results by date", () => {
    const dates = holidaysForYears([2026], {
      countries: ["LK", "US"],
      categories: ALL_CATEGORIES,
    }).map((h) => +h.date);
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
  });
});

describe("grouping by day", () => {
  it("keys only the requested days that have a holiday", () => {
    const days = [new Date(2026, 1, 3), new Date(2026, 1, 4), new Date(2026, 1, 5)];
    const map = holidaysByDay(days, { countries: ["LK"], categories: ALL_CATEGORIES });

    assert.ok(
      holidaysOn(map, new Date(2026, 1, 4)).some((h) => h.name === "Independence Day"),
    );
    assert.deepEqual(holidaysOn(map, new Date(2026, 1, 3)), []);
    assert.deepEqual(holidaysOn(map, new Date(2026, 1, 5)), []);
  });
});

describe("country lookup", () => {
  it("returns a flag for a known code and nothing for an unknown one", () => {
    assert.equal(holidayCountry("LK")?.name, "Sri Lanka");
    assert.equal(holidayCountry("ZZ"), undefined);
  });
});

describe("holiday groups: Public / Bank / Mercantile / Other", () => {
  it("Other stands for national, religious and observance together", () => {
    assert.deepEqual(HOLIDAY_GROUPS.find((g) => g.id === "other")!.categories, [
      "national",
      "religious",
      "observance",
    ]);
    assert.deepEqual(
      HOLIDAY_GROUPS.map((g) => g.label.split(" ")[0]),
      ["Public", "Bank", "Mercantile", "Other"],
    );
  });

  it("switching a group changes only its own categories", () => {
    const on = toggleGroup("other", ["public"], true).sort();
    assert.deepEqual(on, ["national", "observance", "public", "religious"]);
    assert.deepEqual(toggleGroup("other", on, false), ["public"]);
    assert.equal(groupIsOn("public", ["bank"]), false);
    assert.equal(groupIsOn("other", ["religious"]), true);
  });

  it("Sri Lanka with Mercantile on and Public off shows only mercantile holidays", () => {
    let cats: string[] = ["public", "bank", "mercantile"];
    cats = toggleGroup("public", cats, false);
    cats = toggleGroup("bank", cats, false);
    assert.deepEqual(cats, ["mercantile"]);
  });
});
