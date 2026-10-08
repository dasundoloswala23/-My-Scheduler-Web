import type { Task } from "./types";

/**
 * Per-task reminders, mirroring the Flutter app's `Reminder` model.
 *
 * The web app does not schedule alerts — the mobile and desktop apps do, from
 * this same data — so the job here is to write exactly the right document.
 * That is also why rescheduling needs no web code: when a task's time changes,
 * the Flutter side cancels every id the task owned and recomputes from these
 * offsets (cancel-then-schedule), so nothing stale can survive.
 */

export type ReminderType = "atTime" | "beforeTask" | "customTime" | "recurring";
export type ReminderUnit = "minutes" | "hours" | "days";

export interface TaskReminder {
  id: string;
  taskId: string;
  type: ReminderType;
  /** Minutes before the task starts. Ignored for `customTime`. */
  offsetMinutes: number;
  /** ISO string, as the Flutter app stores it. For `customTime` only. */
  absoluteDateTime: string | null;
  /** A disabled reminder is kept but never scheduled. */
  enabled: boolean;
  notificationId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * Fields this client does not know about, kept verbatim and written back.
   *
   * The mobile app adds per-reminder settings (alert style, sound, vibration)
   * over time. Without this, editing a reminder here would silently strip them,
   * which would turn someone's alarm back into a plain notification.
   */
  extra: Record<string, unknown>;
}

const KNOWN_KEYS = new Set([
  "id",
  "taskId",
  "type",
  "offsetMinutes",
  "absoluteDateTime",
  "enabled",
  "notificationId",
  "createdAt",
  "updatedAt",
]);

const TYPES: ReminderType[] = ["atTime", "beforeTask", "customTime", "recurring"];

/** Offsets offered in the picker, in minutes before the start time. */
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 45, 60, 120, 1440, 2880] as const;

export const UNIT_MULTIPLIER: Record<ReminderUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

export function parseReminder(raw: unknown): TaskReminder | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(d)) {
    if (!KNOWN_KEYS.has(key)) extra[key] = value;
  }

  return {
    id: typeof d.id === "string" ? d.id : "",
    taskId: typeof d.taskId === "string" ? d.taskId : "",
    type: TYPES.includes(d.type as ReminderType) ? (d.type as ReminderType) : "beforeTask",
    offsetMinutes: typeof d.offsetMinutes === "number" ? d.offsetMinutes : 0,
    absoluteDateTime: typeof d.absoluteDateTime === "string" ? d.absoluteDateTime : null,
    enabled: typeof d.enabled === "boolean" ? d.enabled : true,
    notificationId: typeof d.notificationId === "number" ? d.notificationId : null,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : null,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : null,
    extra,
  };
}

/** The document shape Flutter reads. Unknown fields are written back untouched. */
export function reminderToJson(r: TaskReminder): Record<string, unknown> {
  return {
    ...r.extra,
    id: r.id,
    taskId: r.taskId,
    type: r.type,
    offsetMinutes: r.offsetMinutes,
    absoluteDateTime: r.absoluteDateTime,
    enabled: r.enabled,
    notificationId: r.notificationId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function newReminder(taskId: string, offsetMinutes: number): TaskReminder {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    taskId,
    type: offsetMinutes === 0 ? "atTime" : "beforeTask",
    offsetMinutes,
    absoluteDateTime: null,
    enabled: true,
    notificationId: null,
    createdAt: now,
    updatedAt: now,
    extra: {},
  };
}

/**
 * The reminders a task actually has.
 *
 * Prefers the rich list and falls back to the legacy minute offsets, with the
 * same synthetic ids Flutter uses (`legacy-<offset>`), so both clients agree on
 * what an older task owns without a migration pass over the database.
 */
export function effectiveReminders(
  task: Pick<Task, "id" | "reminders" | "reminderOffsets">,
): TaskReminder[] {
  if (task.reminders.length > 0) return task.reminders;
  return task.reminderOffsets.map((offset) => ({
    id: `legacy-${offset}`,
    taskId: task.id,
    type: offset === 0 ? ("atTime" as const) : ("beforeTask" as const),
    offsetMinutes: offset,
    absoluteDateTime: null,
    enabled: true,
    notificationId: null,
    createdAt: null,
    updatedAt: null,
    extra: {},
  }));
}

/** When this reminder fires for a task starting at `taskStart`; null if it cannot be placed. */
export function fireTimeFor(r: TaskReminder, taskStart: Date | null): Date | null {
  switch (r.type) {
    case "customTime": {
      if (!r.absoluteDateTime) return null;
      const when = new Date(r.absoluteDateTime);
      return Number.isNaN(+when) ? null : when;
    }
    case "atTime":
      return taskStart;
    case "beforeTask":
    case "recurring":
      return taskStart ? new Date(+taskStart - r.offsetMinutes * 60000) : null;
  }
}

/** "15 minutes before", "At the time", "1 day before". */
export function describeOffset(minutes: number): string {
  if (minutes === 0) return "At the time";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 day before" : `${days} days before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour before" : `${hours} hours before`;
  }
  return minutes === 1 ? "1 minute before" : `${minutes} minutes before`;
}

export function reminderLabel(r: TaskReminder): string {
  return r.type === "customTime" ? "At a set time" : describeOffset(r.offsetMinutes);
}

/** Splits an offset into its largest whole unit, so 120 reads as "2 hours". */
export function splitOffset(minutes: number): { value: number; unit: ReminderUnit } {
  if (minutes !== 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes !== 0 && minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

export interface DueReminder {
  /** Stable per task, reminder and fire time, so it can be de-duplicated. */
  key: string;
  taskId: string;
  title: string;
  label: string;
  startsAt: Date | null;
  firesAt: Date;
}

/**
 * Reminders whose fire time fell inside the last `windowMs`.
 *
 * Completed tasks and disabled reminders never fire. The window is a little
 * wider than the polling interval so a slightly late tick still catches one,
 * and the key includes the fire time so a task that is rescheduled gets a fresh
 * alert rather than being treated as already shown.
 */
export function dueReminders(
  tasks: Pick<
    Task,
    "id" | "title" | "completed" | "startDateTime" | "reminders" | "reminderOffsets"
  >[],
  now: Date,
  windowMs: number,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const task of tasks) {
    if (task.completed || !task.startDateTime) continue;
    for (const r of effectiveReminders(task)) {
      if (!r.enabled) continue;
      const firesAt = fireTimeFor(r, task.startDateTime);
      if (!firesAt) continue;
      const age = +now - +firesAt;
      if (age < 0 || age > windowMs) continue;
      out.push({
        key: `${task.id}:${r.id}:${+firesAt}`,
        taskId: task.id,
        title: task.title,
        label: reminderLabel(r),
        startsAt: task.startDateTime,
        firesAt,
      });
    }
  }
  return out;
}
