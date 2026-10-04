"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { Check, Circle, CircleCheck, GripVertical, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useBoards, useCategoryMap, useLists, useTasks, tasksForList } from "@/lib/hooks";
import { positionBetween, rebalanced } from "@/lib/position";
import {
  appendPosition,
  createTask,
  deleteTask,
  setSubtasks,
  setTaskCompleted,
  updateTaskFields,
} from "@/lib/repo";
import { argbToCss, type Subtask } from "@/lib/types";

export function TaskDetailDialog({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { user } = useAuth();
  const tasks = useTasks();
  const lists = useLists();
  const boards = useBoards();
  const categories = useCategoryMap();

  const task = tasks.find((t) => t.id === taskId);
  const [newSubtask, setNewSubtask] = useState("");

  // null means "not edited yet", so the live title from Firestore shows through
  // until the user types. This avoids syncing state from an effect.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!task || !user) return null;

  const category = task.categoryId ? categories[task.categoryId] : undefined;
  const list = lists.find((l) => l.id === task.listId);
  const board = boards.find((b) => b.id === task.boardId);
  const doneCount = task.subtasks.filter((s) => s.done).length;
  const progress = task.subtasks.length ? doneCount / task.subtasks.length : 0;

  function saveSubtasks(next: Subtask[]) {
    return setSubtasks(user!.uid, task!.id, next);
  }

  function onSubtaskDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = task!.subtasks.findIndex((s) => s.id === active.id);
    const newIndex = task!.subtasks.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(task!.subtasks, oldIndex, newIndex);
    const positions = rebalanced(reordered.length);
    saveSubtasks(reordered.map((s, i) => ({ ...s, position: positions[i] })));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[6vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between p-6 pb-3">
          {category ? (
            <span
              className="rounded-md px-2 py-1 text-[12px] font-semibold"
              style={{
                color: argbToCss(category.colorValue),
                background: `color-mix(in srgb, ${argbToCss(category.colorValue)} 12%, transparent)`,
              }}
            >
              {category.name}
            </span>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <input
            value={titleDraft ?? task.title}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const next = titleDraft?.trim();
              if (next && next !== task.title) {
                updateTaskFields(user.uid, task.id, { title: next });
              }
              setTitleDraft(null);
            }}
            className="w-full bg-transparent text-2xl font-bold outline-none"
          />
          {task.description && <p className="mt-2 text-sm text-muted">{task.description}</p>}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Info label="Board" value={board?.name ?? "—"} />
            <Info label="List" value={list?.name ?? "Inbox"} />
            <Info label="Priority" value={capitalise(task.priority)} />
            <Info
              label="Due date"
              value={task.startDateTime ? format(task.startDateTime, "MMM d, h:mm a") : "Not set"}
            />
          </div>

          <div className="mt-6 flex items-center gap-2">
            <h3 className="text-base font-bold">Subtasks</h3>
            <span className="text-[13px] text-muted">
              {doneCount} of {task.subtasks.length}
            </span>
            <span className="ml-auto text-xs font-semibold text-muted">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div className="mt-2.5 h-[5px] overflow-hidden rounded bg-primary-soft">
            <div
              className="h-full rounded bg-primary transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <div className="mt-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onSubtaskDragEnd}
            >
              <SortableContext
                items={task.subtasks.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {task.subtasks.map((subtask) => (
                  <SubtaskRow
                    key={subtask.id}
                    subtask={subtask}
                    onToggle={() =>
                      saveSubtasks(
                        task.subtasks.map((s) =>
                          s.id === subtask.id ? { ...s, done: !s.done } : s,
                        ),
                      )
                    }
                    onDelete={() => saveSubtasks(task.subtasks.filter((s) => s.id !== subtask.id))}
                    onPromote={async () => {
                      const siblings = task.listId ? tasksForList(tasks, task.listId) : [];
                      await createTask(user.uid, {
                        title: subtask.title,
                        listId: task.listId,
                        boardId: task.boardId,
                        categoryId: task.categoryId,
                        position: appendPosition(siblings),
                      });
                      await saveSubtasks(task.subtasks.filter((s) => s.id !== subtask.id));
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = newSubtask.trim();
              if (!value) return;
              const last = task.subtasks[task.subtasks.length - 1]?.position ?? null;
              saveSubtasks([
                ...task.subtasks,
                {
                  id: crypto.randomUUID(),
                  title: value,
                  done: false,
                  position: positionBetween(last, null),
                },
              ]);
              setNewSubtask("");
            }}
          >
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add a subtask"
              className="flex-1 rounded-xl border border-line bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 text-sm font-semibold text-white"
            >
              Add
            </button>
          </form>
        </div>

        <div className="flex gap-3 border-t border-line p-4">
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
                await deleteTask(user.uid, task.id);
                onClose();
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-danger"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button
            type="button"
            onClick={async () => {
              await setTaskCompleted(user.uid, task, !task.completed);
              onClose();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white"
          >
            <Check className="h-4 w-4" />
            {task.completed ? "Completed" : "Complete task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubtaskRow({
  subtask,
  onToggle,
  onDelete,
  onPromote,
}: {
  subtask: Subtask;
  onToggle: () => void;
  onDelete: () => void;
  onPromote: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: subtask.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="flex items-center gap-2 py-1.5"
    >
      <button type="button" onClick={onToggle} aria-label="Toggle subtask">
        {subtask.done ? (
          <CircleCheck className="h-5 w-5 text-success" />
        ) : (
          <Circle className="h-5 w-5 text-muted" />
        )}
      </button>
      <span className={`flex-1 text-sm ${subtask.done ? "text-muted line-through" : ""}`}>
        {subtask.title}
      </span>
      <button
        type="button"
        onClick={onPromote}
        className="text-[11px] font-semibold text-primary hover:underline"
      >
        To task
      </button>
      <button type="button" onClick={onDelete} aria-label="Delete subtask">
        <Trash2 className="h-4 w-4 text-muted hover:text-danger" />
      </button>
      <button
        type="button"
        aria-label="Reorder subtask"
        className="cursor-grab touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted" />
      </button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-3.5 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-semibold">{value}</p>
    </div>
  );
}

function capitalise(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
