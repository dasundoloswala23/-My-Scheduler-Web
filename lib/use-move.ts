"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { useAuth } from "./auth-context";
import { useOverrides } from "./hooks";
import { moveTask, TaskGoneError, type TaskMove } from "./repo";
import type { Task } from "./types";

/**
 * Runs a drag-and-drop move: optimistic first, Firestore second, rollback plus
 * an error toast on failure, and an Undo action on success.
 *
 * A move never deletes a task. An invalid drop simply never calls this, and
 * dnd-kit animates the card home.
 */
export function useMove() {
  const { user } = useAuth();
  const put = useOverrides((s) => s.put);
  const clear = useOverrides((s) => s.clear);

  return useCallback(
    async (task: Task, move: TaskMove, description: string, allowUndo = true) => {
      if (!user) return;

      // 1. Move it on screen straight away.
      const optimistic: Task = {
        ...task,
        position: move.position ?? task.position,
        listId: move.listId !== undefined ? move.listId : task.listId,
        boardId: move.boardId !== undefined ? move.boardId : task.boardId,
        categoryId: move.categoryId !== undefined ? move.categoryId : task.categoryId,
        startDateTime:
          move.startDateTime !== undefined ? move.startDateTime : task.startDateTime,
        endDateTime: move.endDateTime !== undefined ? move.endDateTime : task.endDateTime,
        priority: move.priority ?? task.priority,
      };
      put(optimistic);

      try {
        // 2. Write it.
        await moveTask(user.uid, task.id, move);
        clear(task.id);

        if (allowUndo) {
          toast(description, {
            action: {
              label: "Undo",
              onClick: () => {
                // 3. Undo writes the previous values back.
                moveTask(user.uid, task.id, {
                  position: task.position,
                  listId: task.listId,
                  boardId: task.boardId,
                  categoryId: task.categoryId,
                  startDateTime: task.startDateTime,
                  endDateTime: task.endDateTime,
                  priority: task.priority,
                }).catch(() => {
                  /* best effort; the live stream still shows the truth */
                });
              },
            },
          });
        }
      } catch (error) {
        // 4. Put it back where it was and say why.
        clear(task.id);
        toast.error(
          error instanceof TaskGoneError
            ? "That task no longer exists."
            : "Could not save the move. Check your connection.",
        );
      }
    },
    [user, put, clear],
  );
}
