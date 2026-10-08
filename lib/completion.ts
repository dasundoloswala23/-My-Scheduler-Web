import type { Task } from "./types";
import { nextOccurrence } from "./recurrence.ts";

/**
 * The rules for completing and re-opening a task, with no Firebase in them.
 * A port of Repo.commitCompletion / reopenTask in the Flutter app, so both
 * clients give the same result for the same task:
 *
 *  - completing MOVES the task to its board's Complete list (same id, no copy)
 *    and remembers where it came from;
 *  - a repeating task also spawns its next occurrence in the ORIGINAL list, with
 *    an id derived from the task and the occurrence, so completing twice (a
 *    double tap, two devices) writes one document, not two;
 *  - re-opening puts the task back and removes the spawned occurrence only if
 *    nobody has touched it.
 */

/** The id of the occurrence that follows `task`. Same on every device and attempt. */
export function nextOccurrenceId(taskId: string, start: Date): string {
  return `${taskId}-next-${start.getTime()}`;
}

export interface CompletionPlan {
  /** Fields to change on the task being completed. Dates are real Dates. */
  patch: Record<string, unknown>;
  /** The next occurrence to create, as overrides to lay over a copy of the task. */
  next: { id: string; overrides: Record<string, unknown> } | null;
}

export interface CompletionContext {
  /** The board's Complete list id, or null when the board has none yet. */
  completeListId: string | null;
  /** A position that sorts before everything in the Complete list. */
  topPosition: number;
  now: Date;
}

export function planCompletion(task: Task, ctx: CompletionContext): CompletionPlan {
  // Where the task was, so reopening can restore it. If it is somehow already in
  // the Complete list, keep whatever origin was recorded.
  const origin = task.listId !== ctx.completeListId ? task.listId : task.completedFromListId;

  const patch: Record<string, unknown> = {
    completed: true,
    completedAt: ctx.now,
  };
  if (ctx.completeListId) {
    patch.listId = ctx.completeListId;
    patch.position = ctx.topPosition;
    patch.completedFromListId = origin;
  }

  let next: CompletionPlan["next"] = null;
  if (task.recurrence !== "none" && task.startDateTime && !task.spawnedNextTaskId) {
    const nextStart = nextOccurrence(task.startDateTime, task.recurrence);
    if (nextStart) {
      const id = nextOccurrenceId(task.id, task.startDateTime);
      const span = task.endDateTime ? +task.endDateTime - +task.startDateTime : null;
      next = {
        id,
        overrides: {
          listId: origin,
          // A fresh task: not done, no files, no history.
          completed: false,
          completedAt: null,
          completedFromListId: null,
          spawnedNextTaskId: null,
          startDateTime: nextStart,
          endDateTime: span === null ? null : new Date(+nextStart + span),
          subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
          attachments: [],
          attachmentCount: 0,
          attachmentPreview: null,
          // Its reminders belong to it, not to the task it was copied from.
          reminders: task.reminders.map((r) => ({ ...r, taskId: id })),
          version: 1,
        },
      };
      patch.spawnedNextTaskId = id;
    }
  }

  return { patch, next };
}

export interface ReopenContext {
  /** Where the user dropped it, when they dragged it out of Complete. */
  toListId?: string | null;
  /** Whether that list (or the remembered origin) still exists and is not Complete. */
  originStillExists: boolean;
  /** The board's first ordinary list, the last resort. */
  firstOrdinaryListId: string | null;
  topPosition: number;
  position?: number;
  /** The spawned next occurrence, if it exists. */
  spawned: Task | null;
}

export interface ReopenPlan {
  patch: Record<string, unknown>;
  /** Id of the spawned occurrence to delete, only when it is untouched. */
  deleteSpawnedId: string | null;
}

/**
 * Where a re-opened task goes: the list asked for, else where it came from if
 * that list still exists, else the board's first ordinary list.
 */
export function chooseReopenList(
  task: Pick<Task, "completedFromListId">,
  ctx: Pick<ReopenContext, "toListId" | "originStillExists" | "firstOrdinaryListId">,
): string | null {
  if (ctx.toListId) return ctx.toListId;
  if (task.completedFromListId && ctx.originStillExists) return task.completedFromListId;
  return ctx.firstOrdinaryListId;
}

export function planReopen(task: Task, ctx: ReopenContext): ReopenPlan {
  const targetListId = chooseReopenList(task, ctx);

  const patch: Record<string, unknown> = {
    completed: false,
    completedAt: null,
    completedFromListId: null,
  };
  if (targetListId) {
    patch.listId = targetListId;
    patch.position = ctx.position ?? ctx.topPosition;
  }

  let deleteSpawnedId: string | null = null;
  if (task.spawnedNextTaskId) {
    if (ctx.spawned) {
      // Untouched means exactly as it was created: not done, never edited.
      if (!ctx.spawned.completed && ctx.spawned.version <= 1) {
        deleteSpawnedId = ctx.spawned.id;
        patch.spawnedNextTaskId = null;
      }
      // A touched occurrence is kept and spawnedNextTaskId stays set, so
      // completing this task again does not create another.
    } else {
      // It was deleted by the user: forget it, so a new one can be made.
      patch.spawnedNextTaskId = null;
    }
  }

  return { patch, deleteSpawnedId };
}
