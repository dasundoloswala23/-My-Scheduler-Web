"use client";

import { Bell, BellOff, Plus, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import {
  REMINDER_PRESETS,
  UNIT_MULTIPLIER,
  describeOffset,
  effectiveReminders,
  fireTimeFor,
  newReminder,
  reminderLabel,
  reminderToJson,
  type ReminderUnit,
  type TaskReminder,
} from "@/lib/reminders";
import { updateTaskFields } from "@/lib/repo";
import type { Task } from "@/lib/types";

/**
 * Multiple reminders per task: at time, 5 / 10 / 15 / 30 / 45 minutes, 1 / 2
 * hours, 1 / 2 days, or a custom amount and unit.
 *
 * This only writes data. The mobile and desktop apps schedule from it, and
 * their scheduler cancels every id the task owned before recomputing — so
 * changing the task's time later reschedules the alerts with nothing to do
 * here, and an old 5:30 PM alert cannot survive a move to 8:00 PM.
 */
export function ReminderEditor({ task }: { task: Task }) {
  const { user } = useAuth();
  const [customOpen, setCustomOpen] = useState(false);
  const [amount, setAmount] = useState("2");
  const [unit, setUnit] = useState<ReminderUnit>("hours");
  const [busy, setBusy] = useState(false);

  const reminders = effectiveReminders(task);
  const hasStart = task.startDateTime !== null;
  const taken = new Set(
    reminders.filter((r) => r.type !== "customTime").map((r) => r.offsetMinutes),
  );

  /**
   * Saves the full list. `reminderOffsets` is cleared in the same write.
   *
   * It has to be: the Flutter side falls back to the legacy offsets whenever
   * `reminders` is empty, so leaving them behind would bring a reminder back
   * the moment the user deleted their last one.
   */
  async function write(next: TaskReminder[]) {
    if (!user || busy) return;
    setBusy(true);
    try {
      await updateTaskFields(user.uid, task.id, {
        reminders: next.map(reminderToJson),
        reminderOffsets: [],
        reminderMinutesBefore: null,
      });
    } catch {
      toast.error("Could not save that reminder. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function add(offsetMinutes: number) {
    if (taken.has(offsetMinutes)) {
      toast.message(`You already have "${describeOffset(offsetMinutes)}".`);
      return;
    }
    void write([...reminders, newReminder(task.id, offsetMinutes)]);
  }

  function addCustom() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      toast.error("Enter a whole number, zero or more.");
      return;
    }
    add(value * UNIT_MULTIPLIER[unit]);
    setCustomOpen(false);
  }

  return (
    <section className="mt-5">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
        <Bell className="h-3.5 w-3.5" />
        Reminders
        {reminders.length > 0 && <span className="text-muted">({reminders.length})</span>}
      </h3>

      {!hasStart && (
        <p className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-surface-variant px-3 py-2 text-[12.5px] text-muted">
          <BellOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Give this task a date and time first. Reminders are counted from its start.
        </p>
      )}

      {reminders.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {reminders.map((r) => {
            const when = fireTimeFor(r, task.startDateTime);
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface-variant px-3 py-2"
              >
                <input
                  type="checkbox"
                  aria-label={`Enable ${reminderLabel(r)}`}
                  checked={r.enabled}
                  onChange={(e) =>
                    void write(
                      reminders.map((x) =>
                        x.id === r.id
                          ? { ...x, enabled: e.target.checked, updatedAt: new Date().toISOString() }
                          : x,
                      ),
                    )
                  }
                  className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] font-semibold ${r.enabled ? "" : "text-muted line-through"}`}>
                    {reminderLabel(r)}
                  </p>
                  {when && (
                    <p className="text-[11.5px] text-muted">
                      {format(when, "EEE, MMM d · h:mm a")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${reminderLabel(r)}`}
                  onClick={() => void write(reminders.filter((x) => x.id !== r.id))}
                  className="shrink-0 text-muted hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {REMINDER_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={busy || !hasStart || taken.has(minutes)}
            onClick={() => add(minutes)}
            className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-muted hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {minutes === 0 ? "At time" : describeOffset(minutes).replace(" before", "")}
          </button>
        ))}
        <button
          type="button"
          disabled={busy || !hasStart}
          onClick={() => setCustomOpen((v) => !v)}
          className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-muted hover:border-primary hover:text-primary disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> Custom
        </button>
      </div>

      {customOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-variant p-3">
          <label className="sr-only" htmlFor="reminder-amount">
            Amount
          </label>
          <input
            id="reminder-amount"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-20 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          />
          <label className="sr-only" htmlFor="reminder-unit">
            Unit
          </label>
          <select
            id="reminder-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as ReminderUnit)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          <span className="text-[12.5px] text-muted">before</span>
          <button
            type="button"
            onClick={addCustom}
            className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white"
          >
            Add
          </button>
          <button
            type="button"
            aria-label="Close custom reminder"
            onClick={() => setCustomOpen(false)}
            className="text-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
