"use client";

import { startOfWeek } from "date-fns";

import { useCategories, useFocusSessions, useTasks } from "@/lib/hooks";
import { argbToCss } from "@/lib/types";

export default function StatisticsPage() {
  const tasks = useTasks();
  const sessions = useFocusSessions();
  const categories = useCategories();

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const completedThisWeek = tasks.filter((t) => t.completedAt && t.completedAt >= weekStart);
  const overdue = tasks.filter((t) => !t.completed && t.startDateTime && t.startDateTime < now).length;
  const completionRate = tasks.length
    ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
    : 0;
  const focusMinutes = sessions
    .filter((s) => s.startedAt >= weekStart)
    .reduce((sum, s) => sum + s.minutes, 0);

  const perDay = Array(7).fill(0) as number[];
  completedThisWeek.forEach((t) => {
    const index = (t.completedAt!.getDay() + 6) % 7;
    perDay[index] += 1;
  });
  const maxPerDay = Math.max(1, ...perDay);

  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    if (!t.completed && t.categoryId) acc[t.categoryId] = (acc[t.categoryId] ?? 0) + 1;
    return acc;
  }, {});
  const totalCounted = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">Your insights</p>
      <h1 className="text-3xl font-bold">Productivity overview</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Completed" value={`${completedThisWeek.length}`} note="This week" color="var(--success)" />
        <Stat label="Completion rate" value={`${completionRate}%`} note="All time" color="var(--primary)" />
        <Stat
          label="Focus time"
          value={`${Math.floor(focusMinutes / 60)}h ${focusMinutes % 60}m`}
          note="This week"
          color="var(--blue)"
        />
        <Stat label="Overdue" value={`${overdue}`} note="Needs attention" color="var(--danger)" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <p className="eyebrow">Last 7 days</p>
          <h2 className="text-xl font-bold">Tasks completed</h2>
          <div className="mt-6 flex h-[180px] items-end gap-3">
            {perDay.map((count, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-lg transition-all"
                  style={{
                    height: `${(count / maxPerDay) * 140 + 6}px`,
                    background: i === (now.getDay() + 6) % 7 ? "var(--primary)" : "var(--primary-soft)",
                  }}
                  title={`${count} completed`}
                />
                <span className="text-[11px] text-muted">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <p className="eyebrow">Distribution</p>
          <h2 className="text-xl font-bold">By category</h2>
          <div className="mt-5 space-y-3.5">
            {totalCounted === 0 && <p className="text-[13px] text-muted">No active tasks yet.</p>}
            {categories
              .filter((c) => (counts[c.id] ?? 0) > 0)
              .map((c) => {
                const share = (counts[c.id] ?? 0) / totalCounted;
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: argbToCss(c.colorValue) }}
                    />
                    <span className="w-28 shrink-0 truncate text-[13px] font-semibold">{c.name}</span>
                    <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[var(--hover)]">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${share * 100}%`, background: argbToCss(c.colorValue) }}
                      />
                    </span>
                    <span className="w-10 text-right text-[12px] text-muted">
                      {Math.round(share * 100)}%
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-[12px] text-muted">{note}</p>
    </div>
  );
}
