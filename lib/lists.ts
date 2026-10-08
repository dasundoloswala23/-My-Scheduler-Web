import { needsRebalance, positionBetween } from "./position.ts";
import type { TaskList } from "./types";

/** The `kind` that marks a board's Complete list. Same value the Flutter app writes. */
export const COMPLETE_KIND = "complete";

/**
 * The lists every board starts with, in order. The fifth is the Complete list,
 * identified by its `kind` and not by its name. Mirrors Repo.defaultLists in the
 * Flutter app.
 */
export const DEFAULT_LISTS: { name: string; color: number; kind: string | null }[] = [
  { name: "Inbox", color: 0xff9ca3af, kind: null },
  { name: "Todo", color: 0xff6c5ce7, kind: null },
  { name: "In progress", color: 0xffe8a33d, kind: null },
  { name: "Waiting", color: 0xff3b82f6, kind: null },
  { name: "Complete", color: 0xff30a46c, kind: COMPLETE_KIND },
  { name: "Someday", color: 0xffa78bfa, kind: null },
];

/** Bumped when the default lists change shape. Version 2 introduced Complete. */
export const LISTS_VERSION = 2;

export const isCompleteList = (list: Pick<TaskList, "kind">) => list.kind === COMPLETE_KIND;

export interface ListMovePlan {
  /** The moved list's new `position`; only meaningful when `needsRebalance` is false. */
  position: number;
  /** The lists in their new order, which is what a renumbering needs. */
  reordered: TaskList[];
  /** The neighbours are too close to split again, so renumber the whole board. */
  needsRebalance: boolean;
}

/**
 * Works out moving list `listId` by `delta` places (-1 left, +1 right) within
 * `ordered`, which must already be sorted by position. Null when it cannot move
 * that way. A port of planListMove in the Flutter app.
 */
export function planListMove(
  ordered: TaskList[],
  listId: string,
  delta: number,
): ListMovePlan | null {
  const from = ordered.findIndex((l) => l.id === listId);
  if (from < 0) return null;
  const to = from + delta;
  if (to < 0 || to >= ordered.length) return null;

  const others = ordered.filter((_, i) => i !== from);
  const moved = ordered[from];
  const reordered = [...others.slice(0, to), moved, ...others.slice(to)];

  const prev = to > 0 ? others[to - 1] : null;
  const next = to < others.length ? others[to] : null;

  return {
    position: positionBetween(prev?.position ?? null, next?.position ?? null),
    reordered,
    needsRebalance: needsRebalance(prev?.position ?? null, next?.position ?? null),
  };
}
