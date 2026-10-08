"use client";

import { onSnapshot, type Query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";

import { useAuth } from "./auth-context";
import {
  mapBoard,
  mapCategory,
  mapFocusSession,
  mapHoliday,
  mapList,
  mapNote,
  mapReminder,
  mapTask,
  paths,
} from "./repo";
import type {
  Board,
  Category,
  FocusSession,
  Holiday,
  Note,
  Reminder,
  Task,
  TaskList,
} from "./types";

/**
 * Tasks the user has just dragged, held locally until the Firestore write comes
 * back. This is what makes a drag feel instant, and what gets rolled back when
 * the write fails.
 */
interface OverrideState {
  overrides: Record<string, Task>;
  put: (task: Task) => void;
  clear: (id: string) => void;
}

export const useOverrides = create<OverrideState>((set) => ({
  overrides: {},
  put: (task) => set((s) => ({ overrides: { ...s.overrides, [task.id]: task } })),
  clear: (id) =>
    set((s) => {
      const next = { ...s.overrides };
      delete next[id];
      return { overrides: next };
    }),
}));

/**
 * The first Firestore listener error, if any.
 *
 * A listener that fails (offline with a cold cache, or a rules denial) used to
 * fail silently, leaving every page looking like an empty account. Recording it
 * lets the shell say what went wrong and offer a retry.
 */
interface DataStatusState {
  error: { code: string; message: string } | null;
  setError: (error: { code: string; message: string } | null) => void;
}

export const useDataStatus = create<DataStatusState>((set) => ({
  error: null,
  setError: (error) => set({ error }),
}));

const EMPTY: never[] = [];

function useCollection<T>(
  build: ((uid: string) => Query) | ((uid: string) => ReturnType<typeof paths.tasks>),
  map: (snap: never) => T,
): T[] {
  const { user } = useAuth();

  // The uid is stored with the rows so a sign-out or account switch shows an
  // empty list immediately, without having to reset state from an effect.
  const [state, setState] = useState<{ uid: string | null; items: T[] }>({
    uid: null,
    items: [],
  });

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      build(user.uid) as Query,
      (snap) => {
        setState({ uid: user.uid, items: snap.docs.map((d) => map(d as never)) });
      },
      (error) => {
        useDataStatus.getState().setError({ code: error.code, message: error.message });
      },
    );
    return unsub;
    // `build` and `map` are module-level functions, stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return user && state.uid === user.uid ? state.items : (EMPTY as T[]);
}

export function useTasks(): Task[] {
  const raw = useCollection<Task>(paths.tasks, mapTask as never);
  const overrides = useOverrides((s) => s.overrides);

  return useMemo(() => {
    const merged = raw.map((t) => overrides[t.id] ?? t);
    return merged.sort((a, b) => a.position - b.position);
  }, [raw, overrides]);
}

export function useBoards(): Board[] {
  const boards = useCollection<Board>(paths.boards, mapBoard as never);
  return useMemo(() => [...boards].sort((a, b) => a.position - b.position), [boards]);
}

export function useLists(): TaskList[] {
  const lists = useCollection<TaskList>(paths.lists, mapList as never);
  return useMemo(() => [...lists].sort((a, b) => a.position - b.position), [lists]);
}

export function useCategories(): Category[] {
  const cats = useCollection<Category>(paths.categories, mapCategory as never);
  return useMemo(() => [...cats].sort((a, b) => a.position - b.position), [cats]);
}

export function useCategoryMap(): Record<string, Category> {
  const cats = useCategories();
  return useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
}

export function useNotes(): Note[] {
  return useCollection<Note>(paths.notes, mapNote as never);
}

export function useReminders(): Reminder[] {
  const items = useCollection<Reminder>(paths.reminders, mapReminder as never);
  return useMemo(() => [...items].sort((a, b) => +a.remindAt - +b.remindAt), [items]);
}

export function useHolidays(): Holiday[] {
  const items = useCollection<Holiday>(paths.holidays, mapHoliday as never);
  return useMemo(() => [...items].sort((a, b) => +a.date - +b.date), [items]);
}

export function useFocusSessions(): FocusSession[] {
  const items = useCollection<FocusSession>(paths.focusSessions, mapFocusSession as never);
  return useMemo(() => [...items].sort((a, b) => +b.startedAt - +a.startedAt), [items]);
}

// ----------------------------------------------------------------- helpers

export function tasksForList(tasks: Task[], listId: string): Task[] {
  return tasks
    .filter((t) => t.listId === listId && !t.parentTaskId)
    .sort((a, b) => a.position - b.position);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function tasksForDay(tasks: Task[], day: Date): Task[] {
  return tasks
    .filter((t) => t.startDateTime && isSameDay(t.startDateTime, day))
    .sort((a, b) => +a.startDateTime! - +b.startDateTime!);
}
