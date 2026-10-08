"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { useAuth } from "./auth-context";
import { useLists, useOverrides } from "./hooks";
import { completeTask, moveTask, reopenTask, TaskGoneError, type TaskMove } from "./repo";
import { isCompleteList } from "./lists.ts";
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
  const lists = useLists();

  return useCallback(
    async (task: Task, move: TaskMove, description: string, allowUndo = true) => {
      if (!user) return;

      // Dropping on the Complete list completes the task, and dragging a
      // finished task out of it re-opens it, exactly as in the Flutter app.
      // Both go through the one completion path, so a repeating task spawns its
      // next occurrence and nothing is duplicated.
      const target = move.listId ? lists.find((l) => l.id === move.listId) : undefined;
      const completing = !!target && isCompleteList(target) && !task.completed;
      const reopening = !!target && !isCompleteList(target) && task.completed;

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
        completed: completing ? true : reopening ? false : task.completed,
      };
      put(optimistic);

      try {
        // 2. Write it.
        let result = { hadConflict: false };
        if (completing) {
          await completeTask(user.uid, task, move.position);
        } else if (reopening) {
          await reopenTask(user.uid, task, { toListId: move.listId, position: move.position });
        } else {
          result = await moveTask(user.uid, task.id, move, task.version);
        }
        clear(task.id);

        // Another device edited this task after the card was drawn. The move
        // went through, but say so: silently overwriting is what section 33 of
        // the brief rules out.
        if (result.hadConflict) {
          toast.warning("This task was changed on another device.", {
            description: "Your move was applied on top of that change.",
          });
        }

        if (allowUndo) {
          toast(description, {
            action: {
              label: "Undo",
              onClick: () => {
                // 3. Undo puts it back. Completing is undone by re-opening, and
                // re-opening by completing, so nothing is left half done.
                if (completing) {
                  reopenTask(user.uid, task, {
                    toListId: task.listId,
                    position: task.position,
                  }).catch(() => {});
                  return;
                }
                if (reopening) {
                  completeTask(user.uid, { ...task, completed: false }).catch(() => {});
                  return;
                }
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
    [user, put, clear, lists],
  );
}
