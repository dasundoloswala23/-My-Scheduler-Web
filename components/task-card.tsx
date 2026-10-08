"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import {
  Bell,
  Calendar,
  CheckSquare,
  Circle,
  CircleCheck,
  Clock,
  FileAudio,
  FileText,
  FileVideo,
  Flag,
  Image as ImageIcon,
  Link as LinkIcon,
  MoreHorizontal,
  Paperclip,
  Repeat,
  Rocket,
  Square,
} from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useTaskFlowBadges } from "@/lib/flow-hooks";
import { useCategoryMap } from "@/lib/hooks";
import { firstLinkIn } from "@/lib/link-preview";
import { usePreferences } from "@/lib/preferences";
import { effectiveReminders, reminderLabel } from "@/lib/reminders";
import { setSubtasks, setTaskCompleted } from "@/lib/repo";
import { argbToCss, type Subtask, type Task } from "@/lib/types";

/** A category colour tinted to sit behind text of the same colour. */
function tint(color: string): string {
  return `color-mix(in srgb, ${color} var(--tint-strength), transparent)`;
}

const RECURRENCE_LABEL: Record<Task["recurrence"], string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function TaskCardBody({ task, onMenu }: { task: Task; onMenu?: () => void }) {
  const categories = useCategoryMap();
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const flowBadge = useTaskFlowBadges()[task.id];

  const category = task.categoryId ? categories[task.categoryId] : undefined;
  const done = task.subtasks.filter((s) => s.done).length;
  const link = firstLinkIn(`${task.description} ${task.title}`);

  const priorityColor =
    task.priority === "high"
      ? "var(--danger)"
      : task.priority === "medium"
        ? "var(--amber)"
        : "var(--muted)";

  // Only enabled reminders count: a switched-off one is kept but never fires.
  const activeReminders = effectiveReminders(task).filter((r) => r.enabled);
  const reminderCount = activeReminders.length;

  const showChecklist = preferences.showSubtasksOnCards && task.subtasks.length > 0;
  const shown = expanded
    ? task.subtasks
    : task.subtasks.slice(0, preferences.subtaskPreviewCount);
  const hidden = task.subtasks.length - shown.length;

  async function toggleSubtask(subtask: Subtask) {
    if (!user) return;
    await setSubtasks(
      user.uid,
      task.id,
      task.subtasks.map((s) => (s.id === subtask.id ? { ...s, done: !s.done } : s)),
    );
  }

  const hasMeta =
    task.priority !== "none" ||
    task.startDateTime ||
    task.subtasks.length > 0 ||
    task.attachmentCount > 0 ||
    task.attachments.length > 0 ||
    task.recurrence !== "none" ||
    !!flowBadge ||
    reminderCount > 0;

  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        {category ? (
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{
              color: argbToCss(category.colorValue),
              background: tint(argbToCss(category.colorValue)),
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

      {/* A real attachment outranks a link: it is something the user put on
          the task deliberately. Only one preview is drawn, to keep the card
          compact. */}
      {task.attachmentPreview ? (
        <AttachmentPreviewTile
          preview={task.attachmentPreview}
          count={task.attachmentCount}
        />
      ) : (
        link && <LinkPreviewTile link={link} />
      )}

      {hasMeta && (
        <>
          <div className="my-2.5 h-px bg-divider" />
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
            {/* Time is shown as well as date, so a board card reads the same
                way as the calendar event it corresponds to. */}
            {task.startDateTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {task.endDateTime
                  ? `${format(task.startDateTime, "h:mm a")} – ${format(task.endDateTime, "h:mm a")}`
                  : format(task.startDateTime, "h:mm a")}
              </span>
            )}
            {task.recurrence !== "none" && (
              <span className="flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {RECURRENCE_LABEL[task.recurrence]}
              </span>
            )}
            {flowBadge && (
              <span className="flex items-center gap-1 text-primary">
                <Rocket className="h-3 w-3" />
                Flow {flowBadge.done}/{flowBadge.total}
              </span>
            )}
            {reminderCount > 0 && (
              <span className="flex items-center gap-1">
                <Bell className="h-3 w-3" />
                {reminderCount === 1
                  ? reminderLabel(activeReminders[0])
                  : `${reminderCount} reminders`}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="h-3 w-3" />
                {done}/{task.subtasks.length} subtasks
              </span>
            )}
            {(task.attachmentCount || task.attachments.length) > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {task.attachmentCount || task.attachments.length}
              </span>
            )}
          </div>
        </>
      )}

      {showChecklist && (
        <div className="mt-2.5">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-divider">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${(done / task.subtasks.length) * 100}%`,
                  background:
                    done === task.subtasks.length ? "var(--success)" : "var(--primary)",
                }}
              />
            </div>
            <span className="text-[11px] font-bold text-muted">
              {done}/{task.subtasks.length}
            </span>
          </div>

          <ul className="mt-1.5">
            {shown.map((s) => (
              <li key={s.id}>
                {/* Its own button, so ticking a box never opens the task
                    dialog and never starts a drag. */}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleSubtask(s);
                  }}
                  className="flex w-full items-start gap-2 rounded px-1 py-[3px] text-left hover:bg-[var(--hover)]"
                >
                  {s.done ? (
                    <CheckSquare className="mt-[1px] h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <Square className="mt-[1px] h-3.5 w-3.5 shrink-0 text-muted" />
                  )}
                  <span
                    className={`truncate text-[12px] leading-tight ${
                      s.done ? "text-disabled line-through" : ""
                    }`}
                  >
                    {s.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {(hidden > 0 || expanded) && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="mt-0.5 px-1 py-0.5 text-[11.5px] font-bold text-primary"
            >
              {expanded ? "Show less" : `+ ${hidden} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A thumbnail for an image attachment, or a typed icon for anything else. */
function AttachmentPreviewTile({
  preview,
  count,
}: {
  preview: NonNullable<Task["attachmentPreview"]>;
  count: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage =
    preview.mimeType.startsWith("image/") && preview.thumbnailUrl && !failed;

  if (showImage) {
    return (
      <div className="relative mt-2.5 overflow-hidden rounded-xl border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.thumbnailUrl!}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-28 w-full object-cover"
        />
        {count > 1 && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full border border-line bg-surface/90 px-1.5 py-0.5 text-[10.5px] font-bold text-muted">
            <Paperclip className="h-2.5 w-2.5" />
            {count}
          </span>
        )}
      </div>
    );
  }

  const Icon = preview.mimeType === "application/pdf"
    ? FileText
    : preview.mimeType.startsWith("video/")
      ? FileVideo
      : preview.mimeType.startsWith("audio/")
        ? FileAudio
        : preview.mimeType.startsWith("image/")
          ? ImageIcon
          : FileText;

  return (
    <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-line bg-surface-variant px-2.5 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-[12px]">
        {preview.fileName || "Attachment"}
      </span>
      {count > 1 && (
        <span className="shrink-0 text-[10.5px] font-bold text-muted">{count}</span>
      )}
    </div>
  );
}

/**
 * A link found in the task text. Shows a thumbnail when one is derivable from
 * the URL, and the domain alone otherwise.
 */
function LinkPreviewTile({ link }: { link: ReturnType<typeof firstLinkIn> }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (!link) return null;

  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-line bg-surface-variant">
      {link.thumbnailUrl && !imageFailed && (
        // A plain <img>: next/image cannot optimise an arbitrary remote host in
        // a static export, and a preview must never block the card.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={link.thumbnailUrl}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="h-24 w-full object-cover"
        />
      )}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
        <div className="min-w-0">
          {link.siteName && (
            <p className="truncate text-[11.5px] font-bold">{link.siteName}</p>
          )}
          <p className="truncate text-[11px] text-muted">{link.domain}</p>
        </div>
      </div>
    </div>
  );
}

/** A board card that can be dragged with mouse, touch or keyboard. */
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
