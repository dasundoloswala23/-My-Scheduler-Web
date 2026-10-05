"use client";

import { format } from "date-fns";
import { addDoc, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { Bell, BellOff, CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useReminders } from "@/lib/hooks";
import { paths } from "@/lib/repo";

/**
 * Reminders list, matching the Flutter app so the same account behaves the
 * same way in both clients.
 *
 * The browser cannot schedule an OS alarm the way the mobile app does, so
 * these are stored reminders shown here and on the calendar; the Flutter app
 * fires the actual notification.
 */
export default function RemindersPage() {
  const { user } = useAuth();
  const reminders = useReminders();
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!user) return;
    const title = window.prompt("Remind me to…");
    if (!title?.trim()) return;
    const when = window.prompt("When? (YYYY-MM-DD HH:MM)", format(new Date(), "yyyy-MM-dd HH:mm"));
    if (!when) return;

    const remindAt = new Date(when.replace(" ", "T"));
    if (Number.isNaN(+remindAt)) {
      toast.error("That date could not be read. Use YYYY-MM-DD HH:MM.");
      return;
    }

    setBusy(true);
    try {
      await addDoc(paths.reminders(user.uid), {
        title: title.trim(),
        remindAt: Timestamp.fromDate(remindAt),
        done: false,
        notificationId: Math.floor(+remindAt / 1000),
        updatedAt: serverTimestamp(),
      });
      toast.success("Reminder added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">My scheduler</p>
          <h1 className="text-3xl font-bold">Reminders</h1>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Add reminder
        </button>
      </div>

      <p className="mt-4 flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-[12.5px] text-primary">
        <BellOff className="h-4 w-4 shrink-0" />
        Alerts are delivered by the mobile and desktop apps. The web app stores and shows them.
      </p>

      {reminders.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-primary-soft">
            <Bell className="h-8 w-8 text-primary" />
          </span>
          <h2 className="text-xl font-bold">Your reminders live here</h2>
          <p className="max-w-sm text-[13px] text-muted">
            This focused space is ready for your content, preferences, and workflow.
          </p>
          <button
            type="button"
            onClick={add}
            className="rounded-xl bg-primary-soft px-5 py-3 text-sm font-semibold text-primary"
          >
            + Add Reminder
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {reminders.map((r) => (
            <div key={r.id} className="card flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                aria-label={r.done ? "Mark as not done" : "Mark as done"}
                onClick={() =>
                  user &&
                  updateDoc(doc(paths.reminders(user.uid), r.id), {
                    done: !r.done,
                    updatedAt: serverTimestamp(),
                  })
                }
              >
                {r.done ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <Circle className="h-5 w-5 text-danger" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-bold ${r.done ? "text-muted line-through" : ""}`}>
                  {r.title}
                </p>
                <p className="text-[12px] text-muted">{format(r.remindAt, "EEE, MMM d · h:mm a")}</p>
              </div>
              <button
                type="button"
                aria-label="Delete reminder"
                onClick={() => user && deleteDoc(doc(paths.reminders(user.uid), r.id))}
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
