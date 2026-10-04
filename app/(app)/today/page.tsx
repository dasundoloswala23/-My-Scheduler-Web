"use client";

import { format } from "date-fns";
import { useState } from "react";

import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { useTasks, tasksForDay } from "@/lib/hooks";
import type { Task } from "@/lib/types";

import { TaskRow } from "../page";

export default function TodayPage() {
  const tasks = useTasks();
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const now = new Date();
  const today = tasksForDay(tasks, now);
  const done = today.filter((t) => t.completed).length;
  const goal = today.length || 8;
  const progress = goal ? done / goal : 0;

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">{format(now, "EEEE, MMMM d")}</p>
      <h1 className="text-3xl font-bold">Today</h1>

      <div className="mt-5 flex items-center gap-5 rounded-2xl bg-primary p-5 text-white">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeDasharray={`${progress * 100} 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
            {done}/{goal}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-widest opacity-80">TODAY&apos;S PROGRESS</p>
          <p className="text-lg font-bold">
            {done >= goal ? "All done for today." : "You're in a good flow."}
          </p>
          <p className="text-[12.5px] opacity-80">
            {done >= goal
              ? "Enjoy the rest of your day."
              : `${goal - done} more to reach your daily goal.`}
          </p>
        </div>
      </div>

      <section className="card mt-5 divide-y divide-line p-5">
        {today.length === 0 && (
          <p className="py-3 text-[13px] text-muted">Nothing scheduled today.</p>
        )}
        {today.map((task) => (
          <TaskRow key={task.id} task={task} onOpen={() => setOpenTask(task)} />
        ))}
      </section>

      {openTask && <TaskDetailDialog taskId={openTask.id} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
