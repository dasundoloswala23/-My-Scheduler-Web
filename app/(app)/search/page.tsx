"use client";

import { format } from "date-fns";
import {
  CheckCircle2,
  CornerDownRight,
  LayoutGrid,
  List as ListIcon,
  NotebookPen,
  SearchX,
  Tag,
} from "lucide-react";
import { useMemo, useState } from "react";

import { TaskDetailDialog } from "@/components/task-detail-dialog";
import {
  useBoards,
  useCategories,
  useCategoryMap,
  useLists,
  useNotes,
  useTasks,
} from "@/lib/hooks";
import type { Priority, Task } from "@/lib/types";

type Kind = "task" | "subtask" | "note" | "board" | "list" | "category";

interface Hit {
  kind: Kind;
  title: string;
  subtitle: string;
  task?: Task;
}

const ICONS: Record<Kind, typeof CheckCircle2> = {
  task: CheckCircle2,
  subtask: CornerDownRight,
  note: NotebookPen,
  board: LayoutGrid,
  list: ListIcon,
  category: Tag,
};

/**
 * Global search. Everything is already streamed in for the board and calendar,
 * so this filters what is in memory rather than issuing new queries.
 */
export default function SearchPage() {
  const tasks = useTasks();
  const notes = useNotes();
  const boards = useBoards();
  const lists = useLists();
  const categories = useCategories();
  const categoryMap = useCategoryMap();

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [status, setStatus] = useState<"" | "done" | "open">("");
  const [scheduled, setScheduled] = useState(false);
  const [hasReminder, setHasReminder] = useState(false);
  const [hasAttachment, setHasAttachment] = useState(false);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const filtersActive =
    !!categoryId || !!boardId || !!priority || !!status || scheduled || hasReminder || hasAttachment;

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q && !filtersActive) return [];

    const matches = (text: string) => !q || text.toLowerCase().includes(q);
    const passes = (t: Task) => {
      if (categoryId && t.categoryId !== categoryId) return false;
      if (boardId && t.boardId !== boardId) return false;
      if (priority && t.priority !== priority) return false;
      if (status === "done" && !t.completed) return false;
      if (status === "open" && t.completed) return false;
      if (scheduled && !t.startDateTime) return false;
      if (hasReminder && !(t.reminderOffsets ?? []).length) return false;
      if (hasAttachment && !(t.attachmentCount ?? 0) && !t.attachments.length) return false;
      return true;
    };

    const out: Hit[] = [];

    for (const task of tasks) {
      if (!passes(task)) continue;
      if (matches(task.title) || matches(task.description)) {
        out.push({
          kind: "task",
          title: task.title,
          subtitle: [
            task.categoryId ? categoryMap[task.categoryId]?.name : null,
            task.startDateTime ? format(task.startDateTime, "MMM d, h:mm a") : null,
            task.completed ? "Completed" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          task,
        });
      }
      for (const sub of task.subtasks) {
        if (matches(sub.title)) {
          out.push({
            kind: "subtask",
            title: sub.title,
            subtitle: `Subtask of ${task.title}`,
            task,
          });
        }
      }
    }

    // Non-task results only make sense when no task filter is applied.
    if (!filtersActive) {
      notes.filter((n) => matches(n.title) || matches(n.body)).forEach((n) =>
        out.push({ kind: "note", title: n.title, subtitle: "Note" }),
      );
      boards.filter((b) => matches(b.name)).forEach((b) =>
        out.push({ kind: "board", title: b.name, subtitle: "Board" }),
      );
      lists.filter((l) => matches(l.name)).forEach((l) =>
        out.push({ kind: "list", title: l.name, subtitle: "List" }),
      );
      categories.filter((c) => matches(c.name)).forEach((c) =>
        out.push({ kind: "category", title: c.name, subtitle: "Category" }),
      );
    }

    return out;
  }, [
    query,
    filtersActive,
    tasks,
    notes,
    boards,
    lists,
    categories,
    categoryMap,
    categoryId,
    boardId,
    priority,
    status,
    scheduled,
    hasReminder,
    hasAttachment,
  ]);

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">Find anything</p>
      <h1 className="text-3xl font-bold">Search</h1>

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks, subtasks, notes, boards, lists, categories…"
        className="mt-5 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={chip(!!categoryId)}
        >
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className={chip(!!boardId)}>
          <option value="">Any board</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
          className={chip(!!priority)}
        >
          <option value="">Any priority</option>
          {(["none", "low", "medium", "high"] as Priority[]).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | "done" | "open")}
          className={chip(!!status)}
        >
          <option value="">Any status</option>
          <option value="open">Not done</option>
          <option value="done">Completed</option>
        </select>

        <Toggle label="Scheduled" active={scheduled} onClick={() => setScheduled((v) => !v)} />
        <Toggle label="Has reminder" active={hasReminder} onClick={() => setHasReminder((v) => !v)} />
        <Toggle
          label="Has attachment"
          active={hasAttachment}
          onClick={() => setHasAttachment((v) => !v)}
        />
      </div>

      <div className="mt-5 space-y-2">
        {hits.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
            <SearchX className="h-8 w-8 text-muted" />
            <p className="font-bold">
              {query.trim() || filtersActive ? "No results" : "Search your workspace"}
            </p>
            <p className="max-w-sm text-[13px] text-muted">
              {query.trim() || filtersActive
                ? "Try a different word, or clear a filter."
                : "Find tasks, subtasks, notes, boards, lists and categories."}
            </p>
          </div>
        ) : (
          hits.map((hit, i) => {
            const Icon = ICONS[hit.kind];
            return (
              <button
                key={`${hit.kind}-${i}`}
                type="button"
                onClick={() => hit.task && setOpenTask(hit.task)}
                className="card flex w-full items-center gap-3 px-4 py-3 text-left transition hover:border-primary"
              >
                <Icon className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="block truncate text-[12px] text-muted">{hit.subtitle}</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      {openTask && <TaskDetailDialog taskId={openTask.id} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

function chip(active: boolean) {
  return `rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold outline-none ${
    active ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-muted"
  }`;
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={chip(active)}>
      {label}
    </button>
  );
}
