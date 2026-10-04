"use client";

import { format } from "date-fns";
import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useCategories, useLists, useTasks, tasksForList } from "@/lib/hooks";
import { positionBetween } from "@/lib/position";
import { deleteTask } from "@/lib/repo";
import { taskDurationMinutes, type Priority, type Task } from "@/lib/types";
import { useMove } from "@/lib/use-move";

/**
 * Keyboard- and screen-reader-friendly equivalent of every drag action.
 * Drag and drop is never the only way to move a task.
 */
export function TaskMenu({ task, onClose }: { task: Task; onClose: () => void }) {
  const { user } = useAuth();
  const lists = useLists();
  const categories = useCategories();
  const tasks = useTasks();
  const move = useMove();

  const [date, setDate] = useState(
    task.startDateTime ? format(task.startDateTime, "yyyy-MM-dd") : "",
  );
  const [time, setTime] = useState(task.startDateTime ? format(task.startDateTime, "HH:mm") : "");

  if (!user) return null;

  const durationMs = taskDurationMinutes(task) * 60000;

  async function applySchedule(nextDate: string, nextTime: string) {
    if (!nextDate) return;
    const start = new Date(`${nextDate}T${nextTime || "09:00"}`);
    await move(
      task,
      { startDateTime: start, endDateTime: new Date(+start + durationMs) },
      `Task moved to ${format(start, "MMM d, h:mm a")}`,
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <p className="eyebrow">Task actions</p>
        <h2 className="mb-4 truncate text-lg font-bold">{task.title}</h2>

        <Row label="Change list">
          <select
            defaultValue={task.listId ?? ""}
            onChange={async (e) => {
              const listId = e.target.value;
              const list = lists.find((l) => l.id === listId);
              if (!list) return;
              const siblings = tasksForList(tasks, listId).filter((t) => t.id !== task.id);
              const last = siblings[siblings.length - 1]?.position ?? null;
              await move(
                task,
                { listId, boardId: list.boardId, position: positionBetween(last, null) },
                `Task moved to ${list.name}`,
              );
              onClose();
            }}
            className="w-full bg-transparent text-sm outline-none"
          >
            <option value="">No list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Change category">
          <select
            defaultValue={task.categoryId ?? ""}
            onChange={async (e) => {
              const categoryId = e.target.value || null;
              const name = categories.find((c) => c.id === categoryId)?.name ?? "Inbox";
              await move(task, { categoryId }, `Task moved to ${name}`);
              onClose();
            }}
            className="w-full bg-transparent text-sm outline-none"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Change priority">
          <select
            defaultValue={task.priority}
            onChange={async (e) => {
              const priority = e.target.value as Priority;
              await move(task, { priority }, `Priority set to ${priority}`);
              onClose();
            }}
            className="w-full bg-transparent text-sm outline-none"
          >
            {(["none", "low", "medium", "high"] as Priority[]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Row>

        <div className="grid grid-cols-2 gap-3">
          <Row label="Change date">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                applySchedule(e.target.value, time);
              }}
              className="w-full bg-transparent text-sm outline-none"
            />
          </Row>
          <Row label="Change time">
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                applySchedule(date || format(new Date(), "yyyy-MM-dd"), e.target.value);
              }}
              className="w-full bg-transparent text-sm outline-none"
            />
          </Row>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold"
          >
            Close
          </button>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(`Delete "${task.title}"?`)) {
                await deleteTask(user.uid, task.id);
                onClose();
              }
            }}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-danger"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block rounded-xl border border-line px-3.5 py-2.5">
      <span className="eyebrow block">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
