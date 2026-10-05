"use client";

import { format } from "date-fns";
import { addDoc, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { Download, PartyPopper, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useHolidays } from "@/lib/hooks";
import { paths } from "@/lib/repo";

/** Fixed-date Sri Lankan public holidays; Poya days move each year. */
const SRI_LANKA_FIXED: [number, number, string][] = [
  [1, 15, "Tamil Thai Pongal Day"],
  [2, 4, "Independence Day"],
  [5, 1, "May Day"],
  [10, 5, "World Teachers' Day"],
  [12, 25, "Christmas Day"],
];

export default function HolidaysPage() {
  const { user } = useAuth();
  const holidays = useHolidays();

  async function add() {
    if (!user) return;
    const name = window.prompt("Holiday name");
    if (!name?.trim()) return;
    const when = window.prompt("Date (YYYY-MM-DD)", format(new Date(), "yyyy-MM-dd"));
    if (!when) return;
    const date = new Date(`${when}T00:00`);
    if (Number.isNaN(+date)) {
      toast.error("That date could not be read. Use YYYY-MM-DD.");
      return;
    }
    await addDoc(paths.holidays(user.uid), {
      name: name.trim(),
      date: Timestamp.fromDate(date),
      region: "Sri Lanka",
    });
  }

  async function seed() {
    if (!user) return;
    const year = new Date().getFullYear();
    let added = 0;
    for (const [month, day, name] of SRI_LANKA_FIXED) {
      const date = new Date(year, month - 1, day);
      const exists = holidays.some(
        (h) => h.name === name && h.date.getFullYear() === date.getFullYear(),
      );
      if (exists) continue;
      await addDoc(paths.holidays(user.uid), {
        name,
        date: Timestamp.fromDate(date),
        region: "Sri Lanka",
      });
      added++;
    }
    toast.success(added ? `Imported ${added} holidays` : "Already imported");
  }

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">My scheduler</p>
          <h1 className="text-3xl font-bold">Holidays</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={seed}
            className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold"
          >
            <Download className="h-4 w-4" /> Import Sri Lanka
          </button>
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {holidays.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-primary-soft">
            <PartyPopper className="h-8 w-8 text-primary" />
          </span>
          <h2 className="text-xl font-bold">Your holidays live here</h2>
          <p className="max-w-sm text-[13px] text-muted">
            Holidays appear on the calendar so you can plan around them.
          </p>
          <button
            type="button"
            onClick={seed}
            className="rounded-xl bg-primary-soft px-5 py-3 text-sm font-semibold text-primary"
          >
            Import Sri Lanka holidays
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {holidays.map((h) => (
            <div key={h.id} className="card flex items-center gap-3 px-4 py-3">
              <span className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-amber/10">
                <span className="text-sm font-bold">{format(h.date, "dd")}</span>
                <span className="text-[9px] text-muted">{format(h.date, "MMM").toUpperCase()}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{h.name}</p>
                <p className="text-[12px] text-muted">{h.region}</p>
              </div>
              <button
                type="button"
                aria-label="Delete holiday"
                onClick={() => user && deleteDoc(doc(paths.holidays(user.uid), h.id))}
              >
                <Trash2 className="h-4 w-4 text-muted hover:text-danger" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
