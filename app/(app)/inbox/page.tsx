"use client";

import { Inbox, Sparkles } from "lucide-react";
import { useState } from "react";

import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { TaskMenu } from "@/components/task-menu";
import { useCategoryMap, useTasks } from "@/lib/hooks";
import { argbToCss, type Task } from "@/lib/types";

/** Screenshot 4: quick capture. Tasks with no board or list wait here. */
export default function InboxPage() {
  const tasks = useTasks();
  const categories = useCategoryMap();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [menuTask, setMenuTask] = useState<Task | null>(null);

  const unsorted = tasks.filter((t) => !t.listId && !t.boardId && !t.completed);

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">Quick capture</p>
      <h1 className="text-3xl font-bold">Inbox</h1>

      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-primary-soft px-4 py-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-bold text-primary">Clear your mind</p>
          <p className="text-[12.5px] text-primary/80">Capture it now, organize it later.</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <h2 className="text-lg font-bold">Unsorted</h2>
        <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-[11px] dark:bg-white/10">
          {unsorted.length}
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {unsorted.map((task) => {
          const category = task.categoryId ? categories[task.categoryId] : undefined;
          return (
            <div key={task.id} className="card flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => setOpenTask(task)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-bold">{task.title}</p>
                <p className="truncate text-[12px]" style={{ color: category ? argbToCss(category.colorValue) : "var(--muted)" }}>
                  {category?.name ?? "Unsorted"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMenuTask(task)}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold"
              >
                Organise
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-3 text-muted">
        <Inbox className="mt-0.5 h-4 w-4" />
        <div>
          <p className="text-[13px] font-bold">Inbox zero feels good.</p>
          <p className="text-[12px]">
            Assign a board, date, or category to move items out of your inbox.
          </p>
        </div>
      </div>

      {openTask && <TaskDetailDialog taskId={openTask.id} onClose={() => setOpenTask(null)} />}
      {menuTask && <TaskMenu task={menuTask} onClose={() => setMenuTask(null)} />}
    </div>
  );
}
