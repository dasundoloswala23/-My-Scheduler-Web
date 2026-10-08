import { Timestamp } from "firebase/firestore";

import type { TaskReminder } from "./reminders";

/**
 * These shapes mirror the Flutter app's models exactly, because both clients
 * read and write the same documents under users/{uid}.
 */

export type Priority = "none" | "low" | "medium" | "high";
export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  boardId: string | null;
  listId: string | null;
  categoryId: string | null;
  parentTaskId: string | null;
  position: number;
  completed: boolean;
  priority: Priority;
  startDateTime: Date | null;
  endDateTime: Date | null;
  recurrence: Recurrence;
  reminderMinutesBefore: number | null;
  /** Minutes before startDateTime to remind; a task can have several. */
  reminderOffsets: number[];
  /**
   * Reminders with their own ids and enabled flags — the current model, shared
   * with the Flutter apps. `reminderOffsets` is only read when this is empty,
   * so a task written by an older build still has the right reminders.
   */
  reminders: TaskReminder[];
  subtasks: Subtask[];
  /** Legacy filename strings from before attachments were real uploads. */
  attachments: string[];
  /** Denormalised count of real attachments, for the card badge. */
  attachmentCount: number;
  /**
   * The first attachment, copied onto the task by the attachment service so a
   * board of fifty cards does not need fifty subcollection reads to draw
   * thumbnails. Written and read by the Flutter apps too, so the shape is a
   * contract.
   */
  attachmentPreview: AttachmentPreview | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  completedAt: Date | null;
  /**
   * The list the task was in when it was completed, so reopening can put it back.
   * Shared with the Flutter app, which writes and reads it too.
   */
  completedFromListId: string | null;
  /**
   * The id of the next occurrence a repeating task spawned when it was completed.
   * Its presence is what stops a second completion creating a second one.
   */
  spawnedNextTaskId: string | null;
  version: number;
}

export interface AttachmentPreview {
  mimeType: string;
  /** Set for images only; other types fall back to a typed icon. */
  thumbnailUrl: string | null;
  fileName: string;
}

export function parseAttachmentPreview(raw: unknown): AttachmentPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.mimeType !== "string") return null;
  return {
    mimeType: d.mimeType,
    thumbnailUrl: typeof d.thumbnailUrl === "string" ? d.thumbnailUrl : null,
    fileName: typeof d.fileName === "string" ? d.fileName : "",
  };
}

export interface Board {
  id: string;
  name: string;
  colorValue: number;
  position: number;
  workspace: string;
}

export interface TaskList {
  id: string;
  boardId: string;
  name: string;
  position: number;
  colorValue: number;
  isSystem: boolean;
  /** `"complete"` marks the board's Complete list; null for every other list. */
  kind: string | null;
}

export interface Category {
  id: string;
  name: string;
  colorValue: number;
  position: number;
  iconCode: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  updatedAt: Date | null;
}

export interface Reminder {
  id: string;
  title: string;
  remindAt: Date;
  done: boolean;
  notificationId: number | null;
}

/**
 * A holiday the user added by hand. Built-in holidays are not stored: they are
 * generated from the tables in `lib/holidays.ts`, so only the user's own
 * entries ever reach Firestore.
 */
export interface Holiday {
  id: string;
  name: string;
  date: Date;
  /** Free-text label kept for documents written before `countryCode` existed. */
  region: string;
  /** ISO 3166-1 alpha-2, or empty for a holiday not tied to a country. */
  countryCode: string;
  /**
   * A holiday category id. Stored as a plain string so an unknown value from a
   * newer build degrades instead of failing to parse.
   */
  category: string;
}

export interface FocusSession {
  id: string;
  startedAt: Date;
  minutes: number;
  taskId: string | null;
  taskTitle: string;
}

/** Firestore stores colours as ARGB ints (Flutter's Color value). */
export function argbToCss(value: number): string {
  const hex = (value & 0xffffff).toString(16).padStart(6, "0");
  return `#${hex}`;
}

type Dateish = Timestamp | Date | null | undefined;

export function toDate(value: Dateish): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
}

export function taskDurationMinutes(task: Task): number {
  if (task.startDateTime && task.endDateTime) {
    return Math.max(15, Math.round((+task.endDateTime - +task.startDateTime) / 60000));
  }
  return 60;
}
