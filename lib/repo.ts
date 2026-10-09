import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Timestamp } from "firebase/firestore";

import { db } from "./firebase";
import { recomputeForTask, unlinkTask } from "./flow-repo";
import { chooseReopenList, planCompletion, planReopen } from "./completion.ts";
import {
  COMPLETE_KIND,
  DEFAULT_LISTS,
  LISTS_VERSION,
  isCompleteList,
  planListMove,
} from "./lists.ts";
import { positionBetween, rebalanced } from "./position";
import { nextOccurrence } from "./recurrence.ts";
import { parseReminder, reminderToJson, type TaskReminder } from "./reminders";
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
    completedFromListId: d.completedFromListId ?? null,
    spawnedNextTaskId: d.spawnedNextTaskId ?? null,
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
    kind: typeof d.kind === "string" ? d.kind : null,
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
  // A task created straight into the Complete list is a finished task.
  let inComplete = false;
  if (task.listId) {
    const listSnap = await getDoc(doc(paths.lists(uid), task.listId));
    inComplete = listSnap.exists() && isCompleteList(mapList(listSnap as Snap));
  }

  const ref = await addDoc(paths.tasks(uid), {
    title: task.title,
    description: task.description ?? "",
    listId: task.listId ?? null,
    boardId: task.boardId ?? null,
    categoryId: task.categoryId ?? null,
    parentTaskId: null,
    position: task.position ?? 1000,
    completed: inComplete,
    completedFromListId: null,
    spawnedNextTaskId: null,
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
    completedAt: inComplete ? Timestamp.fromDate(new Date()) : null,
    version: 1,
  });
  return ref.id;
}

/**
 * Brings the Project Flow a task belongs to up to date after the task changed. A
 * failure is isolated: the screens derive flow state live from the tasks, and the
 * next change refreshes the stored copy.
 */
async function syncFlow(uid: string, taskId: string) {
  try {
    await recomputeForTask(uid, taskId);
  } catch (e) {
    console.warn("Could not update the flow for task", taskId, e);
  }
}

export async function deleteTask(uid: string, id: string) {
  await deleteDoc(doc(paths.tasks(uid), id));
  // A deleted task leaves its flow; the stage then counts the tasks it has.
  try {
    await unlinkTask(uid, id);
  } catch (e) {
    console.warn("Could not unlink deleted task from its flow", id, e);
  }
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

export { nextOccurrence };

/** Date values become Firestore Timestamps; everything else is written as is. */
function toFirestore(fields: Record<string, unknown>): DocumentData {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v instanceof Date ? Timestamp.fromDate(v) : v]),
  );
}

async function listsOfBoard(uid: string, boardId: string): Promise<TaskList[]> {
  const snap = await getDocs(query(paths.lists(uid), where("boardId", "==", boardId)));
  return snap.docs.map((d) => mapList(d as Snap)).sort((x, y) => x.position - y.position);
}

/** A position that sorts before every card now in `listId`. */
async function topPositionIn(uid: string, listId: string, exceptId?: string): Promise<number> {
  const snap = await getDocs(query(paths.tasks(uid), where("listId", "==", listId)));
  const positions = snap.docs
    .filter((d) => d.id !== exceptId)
    .map((d) => (typeof d.data().position === "number" ? (d.data().position as number) : 0));
  return positionBetween(null, positions.length ? Math.min(...positions) : null);
}

/**
 * Completes or re-opens a task. The one entry point the UI and drag-and-drop
 * use, the same as the Flutter app's Repo.setTaskCompleted, so a task behaves
 * the same on every client.
 */
export function setTaskCompleted(uid: string, task: Task, completed: boolean) {
  return completed ? completeTask(uid, task) : reopenTask(uid, task);
}

/**
 * Completes a task by MOVING it to its board's Complete list (same id, no copy),
 * remembering where it came from. A repeating task also gets its next occurrence
 * in the list it came from, with an id derived from the task and the occurrence,
 * so completing the same occurrence twice (double tap, two devices) writes one
 * document. One atomic batch, not a transaction, so it keeps working offline.
 * The rules are in completion.ts and tested against the Flutter vectors.
 */
export async function completeTask(uid: string, task: Task, position?: number) {
  const ref = doc(paths.tasks(uid), task.id);
  // Read the task and its board's lists at the same time: they are independent,
  // and each is a network round trip, which is what makes ticking a card feel slow.
  const [snap, guessedLists] = await Promise.all([
    getDoc(ref),
    task.boardId ? listsOfBoard(uid, task.boardId) : Promise.resolve<TaskList[]>([]),
  ]);
  if (!snap.exists()) throw new TaskGoneError();
  const current = mapTask(snap as Snap);
  if (current.completed) return; // already done: nothing to move, nothing to spawn

  // The task's board could have changed since the card was drawn; if so the lists
  // read above are the wrong board's.
  const boardLists =
    current.boardId === task.boardId
      ? guessedLists
      : current.boardId
        ? await listsOfBoard(uid, current.boardId)
        : [];
  const complete = boardLists.find(isCompleteList) ?? null;
  const top = complete ? (position ?? (await topPositionIn(uid, complete.id, current.id))) : 0;

  const plan = planCompletion(current, {
    completeListId: complete?.id ?? null,
    topPosition: top,
    now: new Date(),
  });

  const batch = writeBatch(db);
  if (plan.next) {
    const { reminders, ...overrides } = plan.next.overrides;
    batch.set(doc(paths.tasks(uid), plan.next.id), {
      ...snap.data(),
      ...toFirestore(overrides),
      reminders: (reminders as TaskReminder[]).map(reminderToJson),
      hasSchedule: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  batch.update(ref, {
    ...toFirestore(plan.patch),
    updatedAt: serverTimestamp(),
    version: increment(1),
  });
  await batch.commit();
  await syncFlow(uid, current.id);
}

/**
 * Re-opens a completed task, putting it back where it came from (or where the
 * user dropped it). A next occurrence spawned by completing it is removed again
 * if nobody has touched it, so completing and un-completing leaves no duplicate.
 */
export async function reopenTask(
  uid: string,
  task: Task,
  opts: { toListId?: string | null; position?: number } = {},
) {
  const ref = doc(paths.tasks(uid), task.id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new TaskGoneError();
  const current = mapTask(snap as Snap);
  if (!current.completed) return;

  let originStillExists = false;
  if (current.completedFromListId) {
    const origin = await getDoc(doc(paths.lists(uid), current.completedFromListId));
    originStillExists = origin.exists() && !isCompleteList(mapList(origin as Snap));
  }
  let firstOrdinaryListId: string | null = null;
  if (current.boardId) {
    firstOrdinaryListId =
      (await listsOfBoard(uid, current.boardId)).find((l) => !isCompleteList(l))?.id ?? null;
  }

  const target = chooseReopenList(current, {
    toListId: opts.toListId,
    originStillExists,
    firstOrdinaryListId,
  });
  const top = target ? (opts.position ?? (await topPositionIn(uid, target, current.id))) : 0;

  let spawned: Task | null = null;
  if (current.spawnedNextTaskId) {
    const spawnedSnap = await getDoc(doc(paths.tasks(uid), current.spawnedNextTaskId));
    spawned = spawnedSnap.exists() ? mapTask(spawnedSnap as Snap) : null;
  }

  const plan = planReopen(current, {
    toListId: opts.toListId,
    originStillExists,
    firstOrdinaryListId,
    topPosition: top,
    position: opts.position,
    spawned,
  });

  const batch = writeBatch(db);
  if (plan.deleteSpawnedId) batch.delete(doc(paths.tasks(uid), plan.deleteSpawnedId));
  batch.update(ref, {
    ...toFirestore(plan.patch),
    updatedAt: serverTimestamp(),
    version: increment(1),
  });
  await batch.commit();
  await syncFlow(uid, current.id);
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

/**
 * Deletes a list without stranding its cards: they move to the board's first
 * remaining ordinary list, or back to the Inbox when there is none. The Complete
 * list is where finished work goes, so it cannot be deleted.
 */
export async function deleteList(uid: string, id: string) {
  const listRef = doc(paths.lists(uid), id);
  const snap = await getDoc(listRef);
  if (!snap.exists()) return;
  const list = mapList(snap as Snap);
  if (isCompleteList(list)) throw new Error("The Complete list cannot be deleted.");

  const inList = await getDocs(query(paths.tasks(uid), where("listId", "==", id)));
  const batch = writeBatch(db);
  if (!inList.empty) {
    const siblings = await listsOfBoard(uid, list.boardId);
    const fallback = siblings.find((l) => l.id !== id && !isCompleteList(l)) ?? null;
    for (const d of inList.docs) {
      batch.update(d.ref, {
        listId: fallback?.id ?? null,
        ...(fallback ? {} : { boardId: null }),
        updatedAt: serverTimestamp(),
        version: increment(1),
      });
    }
  }
  batch.delete(listRef);
  await batch.commit();
}

/** Moves a list one place left (-1) or right (+1) on its board. */
export async function moveListBy(uid: string, listId: string, delta: number) {
  const snap = await getDoc(doc(paths.lists(uid), listId));
  if (!snap.exists()) return;
  const list = mapList(snap as Snap);
  const ordered = await listsOfBoard(uid, list.boardId);
  const plan = planListMove(ordered, listId, delta);
  if (!plan) return;

  if (!plan.needsRebalance) {
    await updateDoc(doc(paths.lists(uid), listId), {
      position: plan.position,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const batch = writeBatch(db);
  const positions = rebalanced(plan.reordered.length);
  plan.reordered.forEach((l, i) =>
    batch.update(doc(paths.lists(uid), l.id), {
      position: positions[i],
      updatedAt: serverTimestamp(),
    }),
  );
  await batch.commit();
}

export function renameList(uid: string, id: string, name: string) {
  return updateDoc(doc(paths.lists(uid), id), { name, updatedAt: serverTimestamp() });
}

/** Adds a board and its default lists (Inbox … Complete … Someday) in one atomic write. */
function addBoardWithLists(
  batch: ReturnType<typeof writeBatch>,
  uid: string,
  boardRef: ReturnType<typeof doc>,
  board: Omit<Board, "id">,
) {
  batch.set(boardRef, { ...board, updatedAt: serverTimestamp() });
  DEFAULT_LISTS.forEach((spec, i) => {
    batch.set(doc(paths.lists(uid)), {
      boardId: boardRef.id,
      name: spec.name,
      position: (i + 1) * 1000,
      colorValue: spec.color,
      isSystem: true,
      ...(spec.kind ? { kind: spec.kind } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function addBoard(uid: string, board: Omit<Board, "id">) {
  const ref = doc(paths.boards(uid));
  const batch = writeBatch(db);
  addBoardWithLists(batch, uid, ref, board);
  await batch.commit();
  return ref.id;
}

/**
 * Deletes a board and tidies up after it. Its lists go with it; its tasks are
 * kept and return to the Inbox rather than being deleted or left pointing at a
 * board that is gone.
 */
export async function deleteBoard(uid: string, id: string) {
  const boardLists = await getDocs(query(paths.lists(uid), where("boardId", "==", id)));
  const boardTasks = await getDocs(query(paths.tasks(uid), where("boardId", "==", id)));
  const batch = writeBatch(db);
  for (const d of boardTasks.docs) {
    batch.update(d.ref, {
      boardId: null,
      listId: null,
      updatedAt: serverTimestamp(),
      version: increment(1),
    });
  }
  for (const d of boardLists.docs) batch.delete(d.ref);
  batch.delete(doc(paths.boards(uid), id));
  await batch.commit();
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

/**
 * Creates the default board, lists and categories on first sign-in, and migrates
 * an existing account to the current list layout. Uses the same `bootstrapped`
 * and `listsVersion` flags as the Flutter app, so whichever client the user
 * opens first seeds or migrates and the other leaves it alone. Safe on every launch.
 */
export async function ensureBootstrap(uid: string): Promise<void> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const data = userSnap.exists() ? userSnap.data() : {};

  if (!data.bootstrapped) {
    const batch = writeBatch(db);
    const boardRef = doc(paths.boards(uid));
    addBoardWithLists(batch, uid, boardRef, {
      name: "Personal Board",
      colorValue: 0xff6c5ce7,
      position: 1000,
      workspace: "Personal workspace",
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

    batch.set(
      userRef,
      { bootstrapped: true, listsVersion: LISTS_VERSION, createdAt: serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
    return;
  }

  if ((typeof data.listsVersion === "number" ? data.listsVersion : 1) < LISTS_VERSION) {
    await migrateLists(uid);
  }
}

/**
 * Gives every board a Complete list. A system list called "Done" BECOMES the
 * Complete list (renamed and marked, keeping every task in it); a board with no
 * Done gets a new one whose id is derived from the board, so two devices running
 * this at once write the same document. Safe to run twice. Mirrors the Flutter
 * app's migrateLists.
 */
export async function migrateLists(uid: string): Promise<void> {
  const boards = await getDocs(paths.boards(uid));
  const lists = await getDocs(paths.lists(uid));
  const batch = writeBatch(db);

  for (const board of boards.docs) {
    const boardLists = lists.docs.filter((d) => d.data().boardId === board.id);
    if (boardLists.some((d) => d.data().kind === COMPLETE_KIND)) continue;

    const done = boardLists.find(
      (d) =>
        d.data().isSystem === true &&
        String(d.data().name ?? "").trim().toLowerCase() === "done",
    );
    if (done) {
      batch.update(done.ref, {
        kind: COMPLETE_KIND,
        name: "Complete",
        updatedAt: serverTimestamp(),
      });
    } else {
      const last = boardLists.reduce(
        (m, d) => Math.max(m, typeof d.data().position === "number" ? d.data().position : 0),
        0,
      );
      batch.set(doc(paths.lists(uid), `complete-${board.id}`), {
        boardId: board.id,
        name: "Complete",
        position: last + 1000,
        colorValue: DEFAULT_LISTS[4].color,
        isSystem: true,
        kind: COMPLETE_KIND,
        updatedAt: serverTimestamp(),
      });
    }
  }

  batch.set(doc(db, "users", uid), { listsVersion: LISTS_VERSION }, { merge: true });
  await batch.commit();
}

/** Position for a card appended to the end of `siblings`. */
export function appendPosition(siblings: { position: number }[]): number {
  const last = siblings.length ? siblings[siblings.length - 1].position : null;
  return positionBetween(last, null);
}

export { setDoc };
