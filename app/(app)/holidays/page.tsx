"use client";

import { format } from "date-fns";
import { addDoc, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import {
  HOLIDAY_CATEGORIES,
  HOLIDAY_COUNTRIES,
  holidayCountry,
  holidaysForYears,
  type HolidayCategoryId,
} from "@/lib/holidays";
import { useHolidays } from "@/lib/hooks";
import { usePreferences } from "@/lib/preferences";
import { paths } from "@/lib/repo";

/**
 * Holiday settings: which countries' calendars to show, which kinds of holiday
 * to include, and any the user adds themselves.
 *
 * No date is written here. Countries and categories are preferences on the user
 * document — shared with the Flutter apps — and the dates come from the holiday
 * service, so unticking a country removes its holidays from the calendar at
 * once and leaves nothing to clean up.
 */
export default function HolidaysPage() {
  const { user } = useAuth();
  const userHolidays = useHolidays();
  const { preferences, save, loading } = usePreferences();
  const [busy, setBusy] = useState(false);

  const countries = new Set(preferences.holidayCountries);
  const categories = new Set(preferences.holidayCategories);

  // What the calendar will actually show this year, so the effect of a tick is
  // visible without leaving the page.
  const preview = useMemo(
    () =>
      holidaysForYears([new Date().getFullYear()], {
        countries: preferences.holidayCountries,
        categories: preferences.holidayCategories,
        userHolidays,
      }),
    [preferences.holidayCountries, preferences.holidayCategories, userHolidays],
  );

  function toggleCountry(code: string, on: boolean) {
    const next = new Set(countries);
    if (on) next.add(code);
    else next.delete(code);
    void save({ holidayCountries: [...next].sort() });
  }

  function toggleCategory(id: string, on: boolean) {
    const next = new Set(categories);
    if (on) next.add(id);
    else next.delete(id);
    void save({ holidayCategories: [...next] });
  }

  async function addOwn() {
    if (!user || busy) return;
    const name = window.prompt("Holiday name");
    if (!name?.trim()) return;

    const when = window.prompt("Date (YYYY-MM-DD)", format(new Date(), "yyyy-MM-dd"));
    if (!when) return;
    const date = new Date(`${when}T00:00`);
    if (Number.isNaN(+date)) {
      toast.error("That date could not be read. Use YYYY-MM-DD.");
      return;
    }

    const typed = window.prompt(
      `Holiday type — one of: ${HOLIDAY_CATEGORIES.map((c) => c.id).join(", ")}`,
      "public",
    );
    const category = (HOLIDAY_CATEGORIES.find((c) => c.id === typed)?.id ??
      "public") as HolidayCategoryId;

    setBusy(true);
    try {
      await addDoc(paths.holidays(user.uid), {
        name: name.trim(),
        date: Timestamp.fromDate(date),
        region: "",
        countryCode: "",
        category,
      });
      toast.success("Holiday added");
    } catch {
      toast.error("Could not save that holiday. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">MyPlanScheduler</p>
          <h1 className="text-3xl font-bold">Holidays</h1>
        </div>
        <button
          type="button"
          onClick={addOwn}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Add your own
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading your holiday settings…</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="eyebrow mb-2">Countries</h2>
            <div className="card divide-y divide-divider">
              {HOLIDAY_COUNTRIES.map((c) => (
                <label
                  key={c.code}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--hover)]"
                >
                  <input
                    type="checkbox"
                    checked={countries.has(c.code)}
                    onChange={(e) => toggleCountry(c.code, e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="text-lg leading-none">{c.flag}</span>
                  <span className="text-sm font-semibold">{c.name}</span>
                </label>
              ))}
            </div>
            {countries.size === 0 && (
              <p className="mt-2 px-1 text-[12.5px] text-muted">
                No country is selected, so the calendar shows no holidays. Nothing is
                assumed for you.
              </p>
            )}
          </section>

          <section>
            <h2 className="eyebrow mb-2">Holiday types</h2>
            <div className="card divide-y divide-divider">
              {HOLIDAY_CATEGORIES.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-[var(--hover)]"
                >
                  <input
                    type="checkbox"
                    checked={categories.has(c.id)}
                    onChange={(e) => toggleCategory(c.id, e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="text-sm font-semibold">{c.plural}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className="mt-8">
        <h2 className="eyebrow mb-2">On your calendar this year</h2>
        {preview.length === 0 ? (
          <div className="card px-5 py-8 text-center">
            <p className="text-[13px] text-muted">
              Nothing yet. Pick a country above, or add a holiday of your own.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((h) => {
              const country = holidayCountry(h.countryCode);
              return (
                <div key={h.id} className="card flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl"
                    style={{
                      background:
                        "color-mix(in srgb, var(--amber) var(--tint-strength), transparent)",
                    }}
                  >
                    <span className="text-sm font-bold text-amber">
                      {format(h.date, "dd")}
                    </span>
                    <span className="text-[9px] text-muted">
                      {format(h.date, "MMM").toUpperCase()}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {country ? `${country.flag} ` : ""}
                      {h.name}
                    </p>
                    <p className="text-[12px] text-muted">
                      {HOLIDAY_CATEGORIES.find((c) => c.id === h.category)?.label}
                    </p>
                  </div>
                  {/* Only the user's own entries can be deleted; a built-in one is
                      turned off by unticking its country or category. */}
                  {h.source === "user" && (
                    <button
                      type="button"
                      aria-label={`Delete ${h.name}`}
                      onClick={() => user && deleteDoc(doc(paths.holidays(user.uid), h.id))}
                    >
                      <Trash2 className="h-4 w-4 text-muted hover:text-danger" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-6 text-[12px] text-muted">
        Lunar holidays such as Poya days, Eid and Diwali move each year and are not in
        the built-in tables. Add those with the button above.
      </p>
    </div>
  );
}
