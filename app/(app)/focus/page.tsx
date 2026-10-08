"use client";

import { format } from "date-fns";
import { Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useFocusSessions, useTasks, isSameDay } from "@/lib/hooks";
import { addFocusSession } from "@/lib/repo";

const SESSION_MINUTES = 25;

/** Screenshot 33: a Pomodoro timer whose finished sessions feed Statistics. */
export default function FocusPage() {
  const { user } = useAuth();
  const sessions = useFocusSessions();
  const tasks = useTasks().filter((t) => !t.completed);

  const [remaining, setRemaining] = useState(SESSION_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState("");
  const startedAt = useRef<Date | null>(null);

  const finish = useCallback(async () => {
    setRunning(false);
    const began = startedAt.current ?? new Date();
    startedAt.current = null;
    setRemaining(SESSION_MINUTES * 60);

    if (user) {
      const task = tasks.find((t) => t.id === taskId);
      await addFocusSession(user.uid, {
        startedAt: began,
        minutes: SESSION_MINUTES,
        taskId: taskId || null,
        taskTitle: task?.title ?? "Focus session",
      });
      toast.success("Focus session complete. Nice work.");
    }
  }, [user, tasks, taskId]);

  // One interval drives the countdown and records the session when it hits zero.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // Finish after this render, so no state is set during the updater.
          queueMicrotask(() => void finish());
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, finish]);

  const todays = sessions.filter((s) => isSameDay(s.startedAt, new Date()));
  const totalMinutes = todays.reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">MyPlanScheduler</p>
      <h1 className="text-3xl font-bold">Focus</h1>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="card flex flex-col items-center px-6 py-12">
          <p className="text-[10px] font-semibold tracking-widest text-primary">FOCUS SESSION</p>
          <p className="mt-4 text-7xl font-light tabular-nums">
            {String(Math.max(0, Math.floor(remaining / 60))).padStart(2, "0")}:
            {String(Math.max(0, remaining % 60)).padStart(2, "0")}
          </p>
          <p className="mt-3 text-[13px] text-muted">
            Ready when you are. Remove distractions and make it count.
          </p>

          <label className="card mt-6 w-full max-w-sm px-4 py-3">
            <span className="eyebrow block">Focusing on</span>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
            >
              <option value="">No task</option>
              {tasks.slice(0, 40).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setRunning(false);
                startedAt.current = null;
                setRemaining(SESSION_MINUTES * 60);
              }}
              className="flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-semibold"
            >
              <Square className="h-4 w-4" /> Stop
            </button>
            <button
              type="button"
              onClick={() => {
                if (running) {
                  finish();
                } else {
                  startedAt.current ??= new Date();
                  setRunning(true);
                }
              }}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white"
            >
              <Play className="h-4 w-4" /> {running ? "Finish" : "Start focus"}
            </button>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Today&apos;s sessions</h2>
            <span className="text-sm font-bold text-primary">
              {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
            </span>
          </div>
          <div className="mt-3 divide-y divide-line">
            {todays.length === 0 && <p className="py-3 text-[13px] text-muted">No sessions yet today.</p>}
            {todays.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <span className="text-[12.5px] font-semibold text-muted">
                  {format(s.startedAt, "HH:mm")}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.taskTitle}</span>
                <span className="text-[12px] text-muted">{s.minutes} min</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
