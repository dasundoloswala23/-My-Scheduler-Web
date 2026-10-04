"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { Calendar, Check, Circle, CircleCheck, Flag, MoreHorizontal, Paperclip } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useCategoryMap } from "@/lib/hooks";
import { setTaskCompleted } from "@/lib/repo";
import { argbToCss, type Task } from "@/lib/types";

export function TaskCardBody({ task, onMenu }: { task: Task; onMenu?: () => void }) {
  const categories = useCategoryMap();
  const { user } = useAuth();
  const category = task.categoryId ? categories[task.categoryId] : undefined;
  const done = task.subtasks.filter((s) => s.done).length;

  const priorityColor =
    task.priority === "high"
      ? "var(--danger)"
      : task.priority === "medium"
        ? "var(--amber)"
        : "var(--muted)";

  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        {category ? (
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
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
        {onMenu && (
          <button
            type="button"
            aria-label="Task actions"
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-muted hover:text-ink"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-start gap-2.5">
        <button
          type="button"
          aria-label={task.completed ? "Mark as not done" : "Mark as done"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (user) setTaskCompleted(user.uid, task, !task.completed);
          }}
          className="mt-0.5 shrink-0"
        >
          {task.completed ? (
            <CircleCheck className="h-[18px] w-[18px] text-success" />
          ) : (
            <Circle className="h-[18px] w-[18px] text-muted" />
          )}
        </button>
        <div className="min-w-0">
          <p
            className={`text-[14px] font-bold leading-snug ${
              task.completed ? "text-muted line-through" : ""
            }`}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{task.description}</p>
          )}
        </div>
      </div>

      {(task.priority !== "none" ||
        task.startDateTime ||
        task.subtasks.length > 0 ||
        task.attachments.length > 0) && (
        <>
          <div className="my-2.5 h-px bg-line" />
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11.5px] font-semibold text-muted">
            {task.priority !== "none" && (
              <span className="flex items-center gap-1" style={{ color: priorityColor }}>
                <Flag className="h-3 w-3" />
                {capitalise(task.priority)}
              </span>
            )}
            {task.startDateTime && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(task.startDateTime, "MMM d")}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                {done}/{task.subtasks.length}
              </span>
            )}
            {task.attachments.length > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {task.attachments.length}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A card that can be dragged with mouse, touch or keyboard. */
export function SortableTaskCard({
  task,
  onOpen,
  onMenu,
}: {
  task: Task;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`mb-2 cursor-grab touch-none active:cursor-grabbing ${
        isDragging ? "opacity-35" : ""
      }`}
    >
      <TaskCardBody task={task} onMenu={onMenu} />
    </div>
  );
}

function capitalise(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
