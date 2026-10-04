"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { addDays, format, startOfWeek } from "date-fns";
import { Clock, GripVertical } from "lucide-react";
import { useState } from "react";

import { useCategoryMap, useHolidays, useTasks, tasksForDay, isSameDay } from "@/lib/hooks";
import { argbToCss, taskDurationMinutes, type Task } from "@/lib/types";
import { useMove } from "@/lib/use-move";

import { TaskCardBody } from "./task-card";
import { TaskDetailDialog } from "./task-detail-dialog";

const HOUR_HEIGHT = 56;
const SLOT_MINUTES = 15;
const SLOT_HEIGHT = (HOUR_HEIGHT * SLOT_MINUTES) / 60;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

type View = "day" | "week" | "month";

export function Calendar() {
  const tasks = useTasks();
  const holidays = useHolidays();
  const move = useMove();

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [active, setActive] = useState<Task | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const days =
    view === "day"
      ? [anchor]
      : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, { weekStartsOn: 1 }), i));

  const unscheduled = tasks.filter((t) => !t.startDateTime && !t.completed);

  function onDragStart(e: DragStartEvent) {
    setActive((e.active.data.current?.task as Task) ?? null);
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    setActive(null);
    const task = a.data.current?.task as Task | undefined;
    if (!task || !over) return;

    const data = over.data.current as { type?: string; start?: Date } | undefined;

    // Dropped back on the unscheduled panel: clear the schedule, never delete.
    if (data?.type === "unscheduled") {
      if (!task.startDateTime) return;
      await move(task, { startDateTime: null, endDateTime: null }, "Task unscheduled");
      return;
    }

    if (data?.type === "slot" && data.start) {
      const start = data.start;
      if (task.startDateTime && +task.startDateTime === +start) return;
      const end = new Date(+start + taskDurationMinutes(task) * 60000);
      await move(
        task,
        { startDateTime: start, endDateTime: end },
        `Task moved to ${format(start, "MMM d, h:mm a")}`,
      );
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex flex-wrap items-center gap-3 px-5 pb-3">
        <h2 className="text-xl font-bold">{format(anchor, "MMMM d, yyyy")}</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAnchor(addDays(anchor, view === "day" ? -1 : -7))}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setAnchor(addDays(anchor, view === "day" ? 1 : 7))}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
          >
            ›
          </button>
          <div className="ml-2 flex overflow-hidden rounded-lg border border-line">
            {(["day", "week", "month"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[13px] font-semibold capitalize ${
                  view === v ? "bg-primary text-white" : ""
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid anchor={anchor} tasks={tasks} onPick={(d) => { setAnchor(d); setView("day"); }} />
      ) : (
        <div className="flex gap-4 px-5 pb-6">
          <UnscheduledPanel tasks={unscheduled} />
          <div className="card min-w-0 flex-1 overflow-hidden">
            <div className="flex border-b border-line">
              <div className="w-14 shrink-0" />
              {days.map((day) => {
                const holiday = holidays.find((h) => isSameDay(h.date, day));
                return (
                  <div key={+day} className="flex-1 py-2 text-center">
                    <p className="eyebrow">{format(day, "EEE")}</p>
                    <p
                      className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                        isSameDay(day, new Date()) ? "bg-primary text-white" : ""
                      }`}
                    >
                      {format(day, "d")}
                    </p>
                    {holiday && (
                      <p className="truncate px-1 text-[10px] text-amber">{holiday.name}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="max-h-[62vh] overflow-y-auto">
              <div className="flex" style={{ height: HOUR_HEIGHT * 24 }}>
                <div className="w-14 shrink-0">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      style={{ height: HOUR_HEIGHT }}
                      className="pr-2 text-right text-[10.5px] text-muted"
                    >
                      {format(new Date(2020, 0, 1, h), "h a")}
                    </div>
                  ))}
                </div>
                {days.map((day) => (
                  <DayColumn
                    key={+day}
                    day={day}
                    tasks={tasksForDay(tasks, day)}
                    onOpen={setOpenTask}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <DragOverlay>
        {active && (
          <div className="w-[240px] rotate-1 shadow-2xl">
            <TaskCardBody task={active} />
          </div>
        )}
      </DragOverlay>

      {openTask && <TaskDetailDialog taskId={openTask.id} onClose={() => setOpenTask(null)} />}
    </DndContext>
  );
}

function DayColumn({
  day,
  tasks,
  onOpen,
}: {
  day: Date;
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1 border-l border-line">
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} style={{ height: HOUR_HEIGHT }} className="border-t border-line/70" />
      ))}

      <div className="absolute inset-0">
        {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
          <Slot
            key={s}
            start={new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, s * SLOT_MINUTES)}
          />
        ))}
      </div>

      {tasks.map((task) => (
        <Event key={task.id} task={task} onOpen={() => onOpen(task)} />
      ))}
    </div>
  );
}

function Slot({ start }: { start: Date }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${+start}`,
    data: { type: "slot", start },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ height: SLOT_HEIGHT }}
      className={isOver ? "border-t-2 border-primary bg-primary/20" : ""}
    />
  );
}

function Event({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const categories = useCategoryMap();
  const move = useMove();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `event:${task.id}`,
    data: { type: "event", task },
  });

  const [resizeDelta, setResizeDelta] = useState(0);

  const start = task.startDateTime!;
  const top = ((start.getHours() * 60 + start.getMinutes()) / 60) * HOUR_HEIGHT;
  const baseHeight = (taskDurationMinutes(task) / 60) * HOUR_HEIGHT;
  const height = Math.max(22, baseHeight + resizeDelta);

  const color = task.categoryId ? categories[task.categoryId] : undefined;
  const css = color ? argbToCss(color.colorValue) : "var(--primary)";

  /** Drag the bottom edge to change the end time, snapped to 15 minutes. */
  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const originY = e.clientY;
    const onMove = (ev: PointerEvent) => setResizeDelta(ev.clientY - originY);
    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const delta = ev.clientY - originY;
      setResizeDelta(0);
      if (Math.abs(delta) < 4) return;

      const minutes = Math.round(((baseHeight + delta) / HOUR_HEIGHT) * 60);
      const snapped = Math.min(24 * 60, Math.max(SLOT_MINUTES, Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES));
      await move(
        task,
        { endDateTime: new Date(+start + snapped * 60000) },
        `Duration set to ${Math.floor(snapped / 60)}h ${snapped % 60}m`,
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      className="absolute inset-x-0.5"
      style={{
        top,
        height,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 40 : 10,
      }}
    >
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={onOpen}
        className="h-full cursor-grab touch-none overflow-hidden rounded-lg px-2 py-1 active:cursor-grabbing"
        style={{
          background: `color-mix(in srgb, ${css} 14%, transparent)`,
          borderLeft: `3px solid ${css}`,
        }}
      >
        <p className="truncate text-[12px] font-bold" style={{ color: css }}>
          {task.title}
        </p>
        {height > 40 && (
          <p className="truncate text-[10.5px]" style={{ color: css }}>
            {format(start, "h:mm")} – {format(new Date(+start + taskDurationMinutes(task) * 60000), "h:mm a")}
          </p>
        )}
      </div>
      <div
        onPointerDown={startResize}
        className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center"
        role="separator"
        aria-label="Resize event"
      >
        <span className="h-[3px] w-7 rounded-full" style={{ background: css, opacity: 0.7 }} />
      </div>
    </div>
  );
}

function UnscheduledPanel({ tasks }: { tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled", data: { type: "unscheduled" } });

  return (
    <aside
      ref={setNodeRef}
      className={`card hidden w-[260px] shrink-0 p-3.5 lg:block ${
        isOver ? "border-2 border-primary bg-primary-soft" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="eyebrow">Drag to schedule</p>
        <span className="text-[11px] text-muted">{tasks.length}</span>
      </div>
      <h3 className="mb-3 text-base font-bold">Unscheduled</h3>
      <div className="max-h-[56vh] space-y-2 overflow-y-auto">
        {tasks.map((task) => (
          <UnscheduledCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <p className="text-[12.5px] text-muted">
            Everything is scheduled. Drag an event here to unschedule it.
          </p>
        )}
      </div>
      <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 py-2 text-[11.5px] text-primary">
        <Clock className="h-3.5 w-3.5" />
        Drag a task onto any time slot to schedule it.
      </p>
    </aside>
  );
}

function UnscheduledCard({ task }: { task: Task }) {
  const categories = useCategoryMap();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unscheduled:${task.id}`,
    data: { type: "unscheduled-task", task },
  });
  const category = task.categoryId ? categories[task.categoryId] : undefined;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex cursor-grab touch-none items-center gap-2 rounded-lg border border-line bg-background px-2.5 py-2 active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{task.title}</p>
        {category && (
          <p className="truncate text-[11px]" style={{ color: argbToCss(category.colorValue) }}>
            {category.name}
          </p>
        )}
      </div>
    </div>
  );
}

function MonthGrid({
  anchor,
  tasks,
  onPick,
}: {
  anchor: Date;
  tasks: Task[];
  onPick: (d: Date) => void;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1),
    ),
  ];

  return (
    <div className="card mx-5 mb-6 p-4">
      <div className="grid grid-cols-7 pb-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <p key={i} className="text-center text-[11px] text-muted">
            {d}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) =>
          day ? <MonthCell key={i} day={day} tasks={tasksForDay(tasks, day)} onPick={onPick} /> : <div key={i} />,
        )}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  tasks,
  onPick,
}: {
  day: Date;
  tasks: Task[];
  onPick: (d: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${+new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9)}`,
    data: { type: "slot", start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9) },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onPick(day)}
      className={`flex aspect-square flex-col items-center justify-center rounded-xl transition ${
        isOver ? "border-2 border-primary bg-primary-soft" : "hover:bg-primary-soft/50"
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${
          isSameDay(day, new Date()) ? "bg-primary text-white" : ""
        }`}
      >
        {day.getDate()}
      </span>
      <span className="mt-1 flex gap-0.5">
        {tasks.slice(0, 3).map((t) => (
          <span
            key={t.id}
            className="h-1 w-1 rounded-full"
            style={{ background: t.completed ? "var(--success)" : "var(--amber)" }}
          />
        ))}
      </span>
    </button>
  );
}
