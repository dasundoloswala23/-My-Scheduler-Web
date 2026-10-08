import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Timestamp } from "firebase/firestore";

import { db } from "./firebase";
import { positionBetween } from "./position";
import { parseReminder, type TaskReminder } from "./reminders";
import {
  parseAttachmentPreview,
  toDate,
  type Board,
  type Category,
  type FocusSession,
  type Holiday,
  type Note,
  type Priority,
  type Recurrence,
  type Reminder,
  type Subtask,
  type Task,
  type TaskList,
} from "./types";

/** Collection paths, all scoped to the signed-in user (matches firestore.rules). */
export const paths = {
  tasks: (uid: string) => collection(db, "users", uid, "tasks"),
  boards: (uid: string) => collection(db, "users", uid, "boards"),
  lists: (uid: string) => collection(db, "users", uid, "lists"),
  categories: (uid: string) => collection(db, "users", uid, "categories"),
  notes: (uid: string) => collection(db, "users", uid, "notes"),
  reminders: (uid: string) => collection(db, "users", uid, "reminders"),
  holidays: (uid: string) => collection(db, "users", uid, "holidays"),
  focusSessions: (uid: string) => collection(db, "users", uid, "focusSessions"),
};

type Snap = QueryDocumentSnapshot<DocumentData>;

// ------------------------------------------------------------------ mappers

export function mapTask(snap: Snap): Task {
  const d = snap.data();
  return {
    id: snap.id,
    title: d.title ?? "",
    description: d.description ?? "",
    boardId: d.boardId ?? null,
    listId: d.listId ?? null,
    categoryId: d.categoryId ?? null,
    parentTaskId: d.parentTaskId ?? null,
    position: typeof d.position === "number" ? d.position : 0,
    completed: !!d.completed,
    priority: (d.priority ?? "none") as Priority,
    startDateTime: toDate(d.startDateTime),
    endDateTime: toDate(d.endDateTime),
    recurrence: (d.recurrence ?? "none") as Recurrence,
    reminderMinutesBefore: d.reminderMinutesBefore ?? null,
    reminderOffsets: (d.reminderOffsets ?? []) as number[],
    reminders: ((d.reminders ?? []) as unknown[])
      .map(parseReminder)
      .filter((x): x is TaskReminder => x !== null),
    attachmentCount: d.attachmentCount ?? 0,
    attachmentPreview: parseAttachmentPreview(d.attachmentPreview),
    subtasks: ((d.subtasks ?? []) as Subtask[])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    attachments: (d.attachments ?? []) as string[],
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    completedAt: toDate(d.completedAt),
    version: d.version ?? 1,
  };
}

export const mapBoard = (snap: Snap): Board => {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name ?? "Board",
    colorValue: d.colorValue ?? 0xff6c5ce7,
    position: d.position ?? 0,
    workspace: d.workspace ?? "Personal workspace",
  };
};

export const mapList = (snap: Snap): TaskList => {
  const d = snap.data();
  return {
    id: snap.id,
    boardId: d.boardId ?? "",
    name: d.name ?? "List",
    position: d.position ?? 0,
    colorValue: d.colorValue ?? 0xff9ca3af,
    isSystem: !!d.isSystem,
  };
};

export const mapCategory = (snap: Snap): Category => {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name ?? "Category",
    colorValue: d.colorValue ?? 0xff6c5ce7,
    position: d.position ?? 0,
    iconCode: d.iconCode ?? 0,
  };
};

export const mapNote = (snap: Snap): Note => {
  const d = snap.data();
  return {
    id: snap.id,
    title: d.title ?? "",
    body: d.body ?? "",
    categoryId: d.categoryId ?? null,
    updatedAt: toDate(d.updatedAt),
  };
};

export const mapReminder = (snap: Snap): Reminder => {
  const d = snap.data();
  return {
    id: snap.id,
    title: d.title ?? "",
    remindAt: toDate(d.remindAt) ?? new Date(),
    done: !!d.done,
    notificationId: d.notificationId ?? null,
  };
};

export const mapHoliday = (snap: Snap): Holiday => {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name ?? "",
    date: toDate(d.date) ?? new Date(),
    region: d.region ?? "",
    countryCode: d.countryCode ?? "",
    category: d.category ?? "public",
  };
};

export const mapFocusSession = (snap: Snap): FocusSession => {
  const d = snap.data();
  return {
    id: snap.id,
    startedAt: toDate(d.startedAt) ?? new Date(),
    minutes: d.minutes ?? 25,
    taskId: d.taskId ?? null,
    taskTitle: d.taskTitle ?? "",
  };
};

// ------------------------------------------------------------------- writes

export interface TaskMove {
  position?: number;
  listId?: string | null;
  boardId?: string | null;
  categoryId?: string | null;
  startDateTime?: Date | null;
  endDateTime?: Date | null;
  priority?: Priority;
}

export class TaskGoneError extends Error {
  constructor() {
    super("That task no longer exists.");
    this.name = "TaskGoneError";
  }
}

/**
 * Applies a drag-and-drop move in a transaction, writing only what changed and
 * bumping `version` so a concurrent edit elsewhere is detectable. Throws
 * TaskGoneError when the task was deleted on another device, so the caller
 * rolls back rather than resurrecting it.
 */
export interface MoveResult {
  /**
   * True when the task had been written by another device since the card was
   * drawn. As in the Flutter app the move still applies (last write wins), but
   * the caller is told so it can say so rather than silently overwriting.
   */
  hadConflict: boolean;
  newVersion: number;
}

/**
 * Applies a drag-and-drop move in a transaction that bumps `version`.
 *
 * `expectedVersion` is the version the dragged card was showing. Throws
 * `TaskGoneError` if the task was deleted elsewhere, so the UI rolls back
 * instead of recreating a dead task.
 */
export async function moveTask(
  uid: string,
  taskId: string,
  move: TaskMove,
  expectedVersion?: number,
): Promise<MoveResult> {
  const ref = doc(paths.tasks(uid), taskId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new TaskGoneError();

    const current = (snap.data().version as number) ?? 1;
    const data: DocumentData = { updatedAt: serverTimestamp(), version: current + 1 };

    if (move.position !== undefined) data.position = move.position;
    if (move.listId !== undefined) data.listId = move.listId;
    if (move.boardId !== undefined) data.boardId = move.boardId;
    if (move.categoryId !== undefined) data.categoryId = move.categoryId;
    if (move.priority !== undefined) data.priority = move.priority;
    if (move.startDateTime !== undefined) {
      data.startDateTime = move.startDateTime ? Timestamp.fromDate(move.startDateTime) : null;
      data.hasSchedule = move.startDateTime !== null;
    }
    if (move.endDateTime !== undefined) {
      data.endDateTime = move.endDateTime ? Timestamp.fromDate(move.endDateTime) : null;
    }

    tx.update(ref, data);
    return {
      hadConflict: expectedVersion !== undefined && current !== expectedVersion,
      newVersion: current + 1,
    };
  });
}

export interface NewTask {
  title: string;
  description?: string;
  listId?: string | null;
  boardId?: string | null;
  categoryId?: string | null;
  position?: number;
  priority?: Priority;
  startDateTime?: Date | null;
  endDateTime?: Date | null;
}

export async function createTask(uid: string, task: NewTask): Promise<string> {
  const ref = await addDoc(paths.tasks(uid), {
    title: task.title,
    description: task.description ?? "",
    listId: task.listId ?? null,
    boardId: task.boardId ?? null,
    categoryId: task.categoryId ?? null,
    parentTaskId: null,
    position: task.position ?? 1000,
    completed: false,
    priority: task.priority ?? "none",
    startDateTime: task.startDateTime ? Timestamp.fromDate(task.startDateTime) : null,
    endDateTime: task.endDateTime ? Timestamp.fromDate(task.endDateTime) : null,
    hasSchedule: !!task.startDateTime,
    recurrence: "none",
    reminderMinutesBefore: null,
    reminderOffsets: [],
    subtasks: [],
    attachments: [],
    attachmentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
    version: 1,
  });
  return ref.id;
}

export function deleteTask(uid: string, id: string) {
  return deleteDoc(doc(paths.tasks(uid), id));
}

/**
 * Writes a partial update to a task and bumps its `version`.
 *
 * Bumping is what lets another device notice that the task changed under it.
 * The Flutter app increments on every edit for the same reason; without it a
 * web edit would be invisible to the conflict check on a drag elsewhere.
 */
export function updateTaskFields(uid: string, id: string, data: DocumentData) {
  return updateDoc(doc(paths.tasks(uid), id), {
    ...data,
    updatedAt: serverTimestamp(),
    version: increment(1),
  });
}

export function setSubtasks(uid: string, id: string, subtasks: Subtask[]) {
  return updateTaskFields(uid, id, { subtasks });
}

/**
 * Next date for a repeating task, matching the Flutter app's nextOccurrence so
 * both clients advance a series identically.
 */
export function nextOccurrence(from: Date, recurrence: Recurrence): Date | null {
  const d = new Date(from);
  switch (recurrence) {
    case "none":
      return null;
    case "daily":
      d.setDate(d.getDate() + 1);
      return d;
    case "weekdays": {
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6);
      return d;
    }
    case "weekly":
      d.setDate(d.getDate() + 7);
      return d;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      return d;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      return d;
  }
}

export async function setTaskCompleted(uid: string, task: Task, completed: boolean) {
  await updateTaskFields(uid, task.id, {
    completed,
    completedAt: completed ? Timestamp.fromDate(new Date()) : null,
  });

  // A repeating task spawns its next instance rather than just closing, the
  // same as the Flutter app. Without this, completing it on the web would
  // silently end the series.
  if (completed && task.recurrence !== "none" && task.startDateTime) {
    const next = nextOccurrence(task.startDateTime, task.recurrence);
    if (next) {
      const span = task.endDateTime ? +task.endDateTime - +task.startDateTime : null;
      await createTask(uid, {
        title: task.title,
        description: task.description,
        listId: task.listId,
        boardId: task.boardId,
        categoryId: task.categoryId,
        position: task.position,
        priority: task.priority,
        startDateTime: next,
        endDateTime: span === null ? null : new Date(+next + span),
      });
    }
  }
}

/** Moves a repeating task to its next occurrence without completing it. */
export async function skipOccurrence(uid: string, task: Task) {
  if (task.recurrence === "none" || !task.startDateTime) return;
  const next = nextOccurrence(task.startDateTime, task.recurrence);
  if (!next) return;
  const span = task.endDateTime ? +task.endDateTime - +task.startDateTime : null;
  await updateTaskFields(uid, task.id, {
    startDateTime: Timestamp.fromDate(next),
    endDateTime: span === null ? null : Timestamp.fromDate(new Date(+next + span)),
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
  });
}

/** Ends the series: the task stays, but stops repeating. */
export function stopSeries(uid: string, taskId: string) {
  return updateTaskFields(uid, taskId, { recurrence: "none" });
}

export async function addList(uid: string, list: Omit<TaskList, "id">) {
  const ref = await addDoc(paths.lists(uid), { ...list, updatedAt: serverTimestamp() });
  return ref.id;
}

export function deleteList(uid: string, id: string) {
  return deleteDoc(doc(paths.lists(uid), id));
}

export function renameList(uid: string, id: string, name: string) {
  return updateDoc(doc(paths.lists(uid), id), { name, updatedAt: serverTimestamp() });
}

export async function addBoard(uid: string, board: Omit<Board, "id">) {
  const ref = await addDoc(paths.boards(uid), { ...board, updatedAt: serverTimestamp() });
  return ref.id;
}

export async function addCategory(uid: string, category: Omit<Category, "id">) {
  const ref = await addDoc(paths.categories(uid), { ...category, updatedAt: serverTimestamp() });
  return ref.id;
}

export function deleteCategory(uid: string, id: string) {
  return deleteDoc(doc(paths.categories(uid), id));
}

export function renameCategory(uid: string, id: string, name: string) {
  return updateDoc(doc(paths.categories(uid), id), { name, updatedAt: serverTimestamp() });
}

export async function addNote(uid: string, note: Omit<Note, "id" | "updatedAt">) {
  const ref = await addDoc(paths.notes(uid), { ...note, updatedAt: serverTimestamp() });
  return ref.id;
}

export function saveNote(uid: string, id: string, data: Partial<Note>) {
  return updateDoc(doc(paths.notes(uid), id), { ...data, updatedAt: serverTimestamp() });
}

export function deleteNote(uid: string, id: string) {
  return deleteDoc(doc(paths.notes(uid), id));
}

export async function addFocusSession(uid: string, session: Omit<FocusSession, "id">) {
  await addDoc(paths.focusSessions(uid), {
    ...session,
    startedAt: Timestamp.fromDate(session.startedAt),
  });
}

// ---------------------------------------------------------------- bootstrap

const DEFAULT_CATEGORIES: [string, number][] = [
  ["Job", 0xff3b82f6],
  ["Personal", 0xff30a46c],
  ["Company", 0xff6c5ce7],
  ["Apps", 0xff8b5cf6],
  ["YouTube", 0xffe5484d],
  ["TikTok", 0xff111827],
  ["Facebook", 0xff1877f2],
  ["Nail Art", 0xffec4899],
  ["Hair Style", 0xffe8a33d],
  ["Kitty Meow", 0xfff59e0b],
  ["Pirith", 0xff14b8a6],
  ["Other", 0xff6b7280],
];

const LIST_COLORS = [0xff9ca3af, 0xff6c5ce7, 0xffe8a33d, 0xff3b82f6, 0xff30a46c, 0xffa78bfa];
const LIST_NAMES = ["Inbox", "Todo", "In progress", "Waiting", "Done", "Someday"];

/**
 * Creates the default board, lists and categories on first sign-in. Uses the
 * same `bootstrapped` flag as the Flutter app, so whichever client the user
 * opens first seeds the data and the other one leaves it alone.
 */
export async function ensureBootstrap(uid: string): Promise<void> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data().bootstrapped) return;

  const batch = writeBatch(db);
  const boardRef = doc(paths.boards(uid));
  batch.set(boardRef, {
    name: "Personal Board",
    colorValue: 0xff6c5ce7,
    position: 1000,
    workspace: "Personal workspace",
    updatedAt: serverTimestamp(),
  });

  LIST_NAMES.forEach((name, i) => {
    batch.set(doc(paths.lists(uid)), {
      boardId: boardRef.id,
      name,
      position: (i + 1) * 1000,
      colorValue: LIST_COLORS[i],
      isSystem: true,
      updatedAt: serverTimestamp(),
    });
  });

  DEFAULT_CATEGORIES.forEach(([name, colorValue], i) => {
    batch.set(doc(paths.categories(uid)), {
      name,
      colorValue,
      position: (i + 1) * 1000,
      iconCode: 0,
      updatedAt: serverTimestamp(),
    });
  });

  batch.set(userRef, { bootstrapped: true, createdAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}

/** Position for a card appended to the end of `siblings`. */
export function appendPosition(siblings: { position: number }[]): number {
  const last = siblings.length ? siblings[siblings.length - 1].position : null;
  return positionBetween(last, null);
}

export { setDoc };
