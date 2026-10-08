"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowLeft, ArrowRight, ListFilter, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useCategories, useLists, useTasks, tasksForList } from "@/lib/hooks";
import { needsRebalance, positionBetween, rebalanced } from "@/lib/position";
import {
  addList,
  appendPosition,
  createTask,
  deleteList,
  moveListBy,
  moveTask,
  renameList,
} from "@/lib/repo";
import { argbToCss, type Task, type TaskList } from "@/lib/types";
import { useMove } from "@/lib/use-move";

import { SortableTaskCard, TaskCardBody } from "./task-card";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskMenu } from "./task-menu";

export function Board({ boardId }: { boardId: string }) {
  const { user } = useAuth();
  const allTasks = useTasks();
  const lists = useLists().filter((l) => l.boardId === boardId);
  const categories = useCategories();
  const move = useMove();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [menuTask, setMenuTask] = useState<Task | null>(null);

  // Filtering only hides cards; the stored data is untouched.
  const tasks = useMemo(
    () => (filterCategory ? allTasks.filter((t) => t.categoryId === filterCategory) : allTasks),
    [allTasks, filterCategory],
  );

  const sensors = useSensors(
    // A small distance means a click still selects, but a drag starts quickly.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch needs a short hold so the board can still be scrolled with a finger.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(event: DragStartEvent) {
    setActiveTask((event.active.data.current?.task as Task) ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over || !user) return;

    const task = active.data.current?.task as Task | undefined;
    if (!task) return;

    // Work out which list was dropped on, and at which slot.
    const overData = over.data.current as { type?: string; task?: Task; listId?: string } | undefined;
    const targetListId =
      overData?.type === "task" ? overData.task!.listId : (overData?.listId ?? null);
    const dropOnTop = overData?.type === "top";
    if (!targetListId) return;

    const siblings = tasksForList(tasks, targetListId).filter((t) => t.id !== task.id);
    let index = dropOnTop ? 0 : siblings.length;
    if (overData?.type === "task") {
      const overIndex = siblings.findIndex((t) => t.id === overData.task!.id);
      if (overIndex >= 0) {
        // Dropping on the upper half of a card inserts before it.
        index = overIndex;
      }
    }

    const prev = index > 0 ? siblings[index - 1].position : null;
    const next = index < siblings.length ? siblings[index].position : null;

    // Renumber the list if two neighbours got too close to split again.
    if (needsRebalance(prev, next)) {
      const positions = rebalanced(siblings.length);
      await Promise.all(
        siblings.map((t, i) => moveTask(user.uid, t.id, { position: positions[i] })),
      );
      return;
    }

    const changedList = task.listId !== targetListId;
    if (!changedList && index === tasksForList(tasks, targetListId).findIndex((t) => t.id === task.id)) {
      return; // dropped back where it started
    }

    const listName = lists.find((l) => l.id === targetListId)?.name ?? "list";
    await move(
      task,
      { position: positionBetween(prev, next), listId: targetListId, boardId },
      changedList ? `Task moved to ${listName}` : "Task reordered",
      changedList,
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
        <div className="flex items-center gap-2 text-sm">
          <ListFilter className="h-4 w-4 text-muted" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold outline-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!user) return;
            const name = window.prompt("List name");
            if (!name?.trim()) return;
            await addList(user.uid, {
              boardId,
              name: name.trim(),
              position: appendPosition(lists),
              colorValue: 0xff9ca3af,
              isSystem: false,
              kind: null,
            });
          }}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-primary"
        >
          <Plus className="h-4 w-4" /> Add list
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveTask(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up task ${active.id}`,
            onDragOver: () => "Moving task",
            onDragEnd: () => "Task dropped",
            onDragCancel: () => "Move cancelled, the task returned to its place",
          },
        }}
      >
        <div className="flex h-full gap-3.5 overflow-x-auto px-5 pb-6">
          {lists.map((list, index) => (
            <Column
              key={list.id}
              list={list}
              index={index}
              count={lists.length}
              dragging={activeTask !== null}
              tasks={tasksForList(tasks, list.id)}
              onOpenTask={setOpenTask}
              onMenuTask={setMenuTask}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.4,1)" }}>
          {activeTask && (
            <div className="w-[310px] rotate-1 shadow-2xl">
              <TaskCardBody task={activeTask} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {openTask && (
        <TaskDetailDialog
          taskId={openTask.id}
          onClose={() => setOpenTask(null)}
          onMenu={() => setMenuTask(openTask)}
        />
      )}
      {menuTask && <TaskMenu task={menuTask} onClose={() => setMenuTask(null)} />}
    </>
  );
}

/**
 * A labelled drop target above the first card ("top") or below the last ("end").
 * Collapsed to a thin strip until a card is being dragged, then opens up and says
 * what it is, so there is always an obvious place to drop a card first or last.
 */
function DropZone({
  id,
  listId,
  where,
  open,
}: {
  id: string;
  listId: string;
  where: "top" | "end";
  open: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: where, listId } });
  return (
    <div
      ref={setNodeRef}
      className={`my-1 flex items-center justify-center rounded-xl border text-[12.5px] font-semibold transition-all duration-150 ${
        isOver
          ? "h-14 border-2 border-primary bg-primary-soft text-primary"
          : open
            ? "h-10 border-line text-muted"
            : "h-2 border-transparent"
      }`}
    >
      {open || isOver ? (isOver ? "Drop task here" : where === "top" ? "Drop task here" : "Drop at the end") : null}
    </div>
  );
}

function Column({
  list,
  index,
  count,
  dragging,
  tasks,
  onOpenTask,
  onMenuTask,
}: {
  list: TaskList;
  index: number;
  count: number;
  /** True while any card is being dragged; the drop zones open up for it. */
  dragging: boolean;
  tasks: Task[];
  onOpenTask: (t: Task) => void;
  onMenuTask: (t: Task) => void;
}) {
  const { user } = useAuth();
  const { setNodeRef } = useDroppable({
    id: `list:${list.id}`,
    data: { type: "list", listId: list.id },
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [composing, setComposing] = useState(false);
  const [cardTitle, setCardTitle] = useState("");

  async function saveName() {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!user || !next || next === list.name) {
      setNameDraft(list.name);
      return;
    }
    await renameList(user.uid, list.id, next);
  }

  async function addCard() {
    const title = cardTitle.trim();
    if (!user || !title) return;
    await createTask(user.uid, {
      title,
      listId: list.id,
      boardId: list.boardId,
      position: appendPosition(tasks),
    });
    // Stay in the composer so several cards can be typed in a row.
    setCardTitle("");
  }

  return (
    <section className="flex w-[330px] shrink-0 flex-col rounded-[18px] border border-line bg-surface-variant p-2.5">
      <header className="flex items-center gap-2 px-1.5 pb-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: argbToCss(list.colorValue) }}
        />
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNameDraft(list.name);
                setEditingName(false);
              }
            }}
            aria-label="List name"
            className="min-w-0 flex-1 rounded-md border border-primary bg-surface px-2 py-0.5 text-[14px] font-bold outline-none"
          />
        ) : (
          <h3
            onDoubleClick={() => {
              setNameDraft(list.name);
              setEditingName(true);
            }}
            title="Double-click to rename"
            className="cursor-text truncate text-[14px] font-bold"
          >
            {list.name}
          </h3>
        )}
        <span className="rounded-md bg-[var(--hover)] px-1.5 py-0.5 text-[11px]">
          {tasks.length}
        </span>
        {!editingName && (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Move list left"
              disabled={index === 0}
              onClick={() => user && moveListBy(user.uid, list.id, -1)}
              className="text-muted hover:text-ink disabled:opacity-30"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Move list right"
              disabled={index === count - 1}
              onClick={() => user && moveListBy(user.uid, list.id, 1)}
              className="text-muted hover:text-ink disabled:opacity-30"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {!editingName && (
          <button
            type="button"
            aria-label="Rename list"
            onClick={() => {
              setNameDraft(list.name);
              setEditingName(true);
            }}
            className="text-muted hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {!editingName && !list.isSystem && (
          <button
            type="button"
            aria-label="Delete list"
            onClick={() => {
              if (user && window.confirm(`Delete "${list.name}"? Its cards move to another list.`)) {
                deleteList(user.uid, list.id);
              }
            }}
            className="text-[11px] font-semibold text-muted hover:text-danger"
          >
            Delete
          </button>
        )}
      </header>

      {/* The whole column is the drop target; an empty list still has height. */}
      <div ref={setNodeRef} className="min-h-[120px] flex-1 overflow-y-auto px-0.5">
        <DropZone id={`top:${list.id}`} listId={list.id} where="top" open={dragging} />
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpenTask(task)}
              onMenu={() => onMenuTask(task)}
            />
          ))}
        </SortableContext>
        <DropZone id={`end:${list.id}`} listId={list.id} where="end" open={dragging} />
      </div>

      {composing ? (
        <div className="mt-2 rounded-xl border border-primary bg-surface p-2">
          <input
            autoFocus
            value={cardTitle}
            onChange={(e) => setCardTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCard();
              if (e.key === "Escape") {
                setCardTitle("");
                setComposing(false);
              }
            }}
            placeholder="Card title…"
            aria-label="New card title"
            className="w-full bg-transparent px-1 py-1 text-[13.5px] outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={addCard}
              disabled={!cardTitle.trim()}
              className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                setCardTitle("");
                setComposing(false);
              }}
              className="rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-muted hover:text-ink"
            >
              Cancel
            </button>
            <span className="ml-auto text-[11px] text-muted">Enter to add</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold text-primary hover:bg-primary-soft"
        >
          <Plus className="h-4 w-4" /> Add card
        </button>
      )}
    </section>
  );
}
