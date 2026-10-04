import { Timestamp } from "firebase/firestore";

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
  subtasks: Subtask[];
  attachments: string[];
  createdAt: Date | null;
  updatedAt: Date | null;
  completedAt: Date | null;
  version: number;
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

export interface Holiday {
  id: string;
  name: string;
  date: Date;
  region: string;
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
