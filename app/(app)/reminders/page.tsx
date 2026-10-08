"use client";

import { addDays, format, startOfDay } from "date-fns";
import { addDoc, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { Bell, BellOff, CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { useAuth } from "@/lib/auth-context";
import { isSameDay, useReminders, useTasks } from "@/lib/hooks";
import { effectiveReminders, fireTimeFor, reminderLabel } from "@/lib/reminders";
import { paths } from "@/lib/repo";

interface TaskReminderRow {
  key: string;
  taskId: string;
  title: string;
  label: string;
  when: Date;
}

/**
 * Reminders, matching the Flutter app so the same account behaves the same way
 * in both clients.
 *
 * Two kinds appear here. Reminders attached to a task come from the task
 * itself — one record, never copied — so clicking one opens that task. The
 * standalone reminders are the free-standing ones from the Quick Add sheet.
 *
 * The browser cannot schedule an OS alarm the way the mobile app does, so the
 * mobile and desktop apps fire the actual alerts from this same data.
 */
export default function RemindersPage() {
  const { user } = useAuth();
  const standalone = useReminders();
  const tasks = useTasks();
  const [busy, setBusy] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Upcoming reminders derived from the tasks, never stored a second time.
  const taskRows = useMemo<TaskReminderRow[]>(() => {
    const today = startOfDay(new Date());
    const rows: TaskReminderRow[] = [];
    for (const task of tasks) {
      if (task.completed || !task.startDateTime) continue;
      for (const r of effectiveReminders(task)) {
        if (!r.enabled) continue;
        const when = fireTimeFor(r, task.startDateTime);
        if (!when || when < today) continue;
        rows.push({
          key: `${task.id}:${r.id}`,
          taskId: task.id,
          title: task.title,
          label: reminderLabel(r),
          when,
        });
      }
    }
    return rows.sort((a, b) => +a.when - +b.when);
  }, [tasks]);

  const groups = useMemo(() => {
    const now = new Date();
    const tomorrow = addDays(now, 1);
    const buckets: { title: string; rows: TaskReminderRow[] }[] = [
      { title: "Today", rows: [] },
      { title: "Tomorrow", rows: [] },
      { title: "Later", rows: [] },
    ];
    for (const row of taskRows) {
      if (isSameDay(row.when, now)) buckets[0].rows.push(row);
      else if (isSameDay(row.when, tomorrow)) buckets[1].rows.push(row);
      else buckets[2].rows.push(row);
    }
    return buckets.filter((b) => b.rows.length > 0);
  }, [taskRows]);

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
    } catch {
      toast.error("Could not save that reminder. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const nothing = standalone.length === 0 && taskRows.length === 0;

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">MyPlanScheduler</p>
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

      {nothing ? (
        <div className="card mt-6 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-primary-soft">
            <Bell className="h-8 w-8 text-primary" />
          </span>
          <h2 className="text-xl font-bold">No reminders yet</h2>
          <p className="max-w-sm text-[13px] text-muted">
            Open a task with a date and time to add reminders to it, or add a free-standing
            reminder here.
          </p>
          <button
            type="button"
            onClick={add}
            className="rounded-xl bg-primary-soft px-5 py-3 text-sm font-semibold text-primary"
          >
            + Add reminder
          </button>
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.title} className="mt-6">
              <h2 className="eyebrow mb-2">{group.title}</h2>
              <div className="space-y-2.5">
                {group.rows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setOpenTaskId(row.taskId)}
                    className="card flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--hover)]"
                  >
                    <Bell className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{row.title}</span>
                      <span className="block text-[12px] text-muted">
                        {format(row.when, "h:mm a")} · {row.label}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold text-primary">Open</span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {standalone.length > 0 && (
            <section className="mt-8">
              <h2 className="eyebrow mb-2">Free-standing</h2>
              <div className="space-y-2.5">
                {standalone.map((r) => (
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
                      <p
                        className={`truncate text-sm font-bold ${
                          r.done ? "text-muted line-through" : ""
                        }`}
                      >
                        {r.title}
                      </p>
                      <p className="text-[12px] text-muted">
                        {format(r.remindAt, "EEE, MMM d · h:mm a")}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${r.title}`}
                      onClick={() => user && deleteDoc(doc(paths.reminders(user.uid), r.id))}
                    >
                      <Trash2 className="h-4 w-4 text-muted hover:text-danger" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {openTaskId && (
        <TaskDetailDialog taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      )}
    </div>
  );
}
