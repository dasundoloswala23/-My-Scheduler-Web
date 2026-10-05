"use client";

import { format } from "date-fns";
import { BarChart3, CalendarDays, Circle, CircleCheck, Flag, Sun } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { useAuth } from "@/lib/auth-context";
import { useBoards, useCategoryMap, useTasks, tasksForDay, isSameDay } from "@/lib/hooks";
import { setTaskCompleted } from "@/lib/repo";
import { argbToCss, type Task } from "@/lib/types";

/** Screenshots 22–24: the dashboard. */
export default function HomePage() {
  const { user } = useAuth();
  const tasks = useTasks();
  const boards = useBoards();
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const now = new Date();
  const today = tasksForDay(tasks, now);
  const completedToday = today.filter((t) => t.completed).length;
  const overdue = tasks.filter(
    (t) => !t.completed && t.startDateTime && t.startDateTime < now && !isSameDay(t.startDateTime, now),
  ).length;
  const upcoming = tasks.filter(
    (t) =>
      t.startDateTime &&
      t.startDateTime > now &&
      +t.startDateTime < +now + 7 * 24 * 3600 * 1000,
  ).length;
  const completionRate = tasks.length
    ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
    : 0;

  const firstName = (user?.displayName ?? user?.email ?? "there").split(/[\s@]/)[0];
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">{format(now, "EEEE, MMMM d")}</p>
      <h1 className="mt-1 text-3xl font-bold">
        {greeting}, {firstName}
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Sun} label="Today" value={`${today.length}`} note={`${completedToday} completed`} color="var(--amber)" />
        <Stat icon={Flag} label="Overdue" value={`${overdue}`} note="Needs attention" color="var(--danger)" />
        <Stat icon={CalendarDays} label="Upcoming" value={`${upcoming}`} note="Next 7 days" color="var(--blue)" />
        <Stat icon={BarChart3} label="Completed" value={`${completionRate}%`} note="All time" color="var(--success)" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Your day</p>
              <h2 className="text-xl font-bold">Today</h2>
            </div>
            <span className="rounded-lg bg-primary-soft px-2.5 py-1 text-[12px] font-semibold text-primary">
              {today.length - completedToday} remaining
            </span>
          </div>

          <div className="mt-4 divide-y divide-line">
            {today.length === 0 && (
              <p className="py-4 text-[13px] text-muted">
                Nothing scheduled today. Use Quick add to plan something.
              </p>
            )}
            {today.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={() => setOpenTask(task)} />
            ))}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">{format(now, "MMMM d")}</p>
              <h2 className="text-xl font-bold">Schedule</h2>
            </div>
            <Link href="/calendar" className="text-[13px] font-semibold text-primary hover:underline">
              Open calendar →
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            {today.filter((t) => t.startDateTime).length === 0 && (
              <p className="text-[13px] text-muted">No timed events today.</p>
            )}
            {today
              .filter((t) => t.startDateTime)
              .map((task) => (
                <div key={task.id} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-[12px] font-semibold text-muted">
                    {format(task.startDateTime!, "h:mm a")}
                  </span>
                  <div className="min-w-0 flex-1 rounded-lg bg-primary-soft px-3 py-2">
                    <p className="truncate text-[13px] font-bold text-primary">{task.title}</p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>

      <section className="card mt-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Workspaces</p>
            <h2 className="text-xl font-bold">Recent boards</h2>
          </div>
          <Link href="/boards" className="text-[13px] font-semibold text-primary hover:underline">
            View all boards →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/board?id=${board.id}`}
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 transition hover:border-primary"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: `color-mix(in srgb, ${argbToCss(board.colorValue)} 14%, transparent)` }}
              >
                <BarChart3 className="h-5 w-5" style={{ color: argbToCss(board.colorValue) }} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{board.name}</p>
                <p className="text-[12px] text-muted">
                  {tasks.filter((t) => t.boardId === board.id).length} tasks
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {openTask && <TaskDetailDialog taskId={openTask.id} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
  color,
}: {
  icon: typeof Sun;
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </span>
      <div>
        <p className="eyebrow">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-[12px] text-muted">{note}</p>
      </div>
    </div>
  );
}

export function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { user } = useAuth();
  const categories = useCategoryMap();
  const category = task.categoryId ? categories[task.categoryId] : undefined;

  return (
    <div className="flex items-center gap-3 py-3">
      <button
        type="button"
        aria-label={task.completed ? "Mark as not done" : "Mark as done"}
        onClick={() => user && setTaskCompleted(user.uid, task, !task.completed)}
      >
        {task.completed ? (
          <CircleCheck className="h-5 w-5 text-success" />
        ) : (
          <Circle className="h-5 w-5 text-muted" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={`truncate text-sm font-semibold ${task.completed ? "text-muted line-through" : ""}`}>
          {task.title}
        </p>
        <p className="truncate text-[12px] text-muted">
          {category && (
            <span style={{ color: argbToCss(category.colorValue) }}>{category.name} · </span>
          )}
          {task.startDateTime ? format(task.startDateTime, "h:mm a") : "No time"}
        </p>
      </button>
      {task.priority !== "none" && (
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize"
          style={{
            color: task.priority === "high" ? "var(--danger)" : task.priority === "medium" ? "var(--amber)" : "var(--muted)",
            background: "color-mix(in srgb, currentColor 12%, transparent)",
          }}
        >
          {task.priority}
        </span>
      )}
    </div>
  );
}
