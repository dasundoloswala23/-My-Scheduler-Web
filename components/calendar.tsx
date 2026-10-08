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
import { Clock, GripVertical, PartyPopper } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  holidayCountry,
  holidaysByDay,
  holidaysOn,
  holidayCategoryLabel,
  type HolidayEntry,
} from "@/lib/holidays";
import { useCategoryMap, useHolidays, useTasks, tasksForDay, isSameDay } from "@/lib/hooks";
import {
  DENSITY_HOUR_HEIGHT,
  densityShowsDetail,
  usePreferences,
  type CalendarViewPref,
} from "@/lib/preferences";
import { argbToCss, taskDurationMinutes, type Task } from "@/lib/types";
import { useMove } from "@/lib/use-move";

import { TaskCardBody } from "./task-card";
import { TaskDetailDialog } from "./task-detail-dialog";

const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

type View = CalendarViewPref;

const VIEWS: { id: View; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "threeDay", label: "3 Days" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "agenda", label: "Agenda" },
];

/** Views that lay tasks out on a time grid. */
function isTimeGrid(view: View): boolean {
  return view === "day" || view === "threeDay" || view === "week";
}

export function Calendar() {
  const tasks = useTasks();
  const userHolidays = useHolidays();
  const move = useMove();
  const { preferences, save } = usePreferences();

  // null means "use the saved default", so the page honours the preference on
  // open without fighting a change made while it is on screen.
  const [chosenView, setChosenView] = useState<View | null>(null);
  const view = chosenView ?? preferences.calendarDefaultView;
  const hourHeight = DENSITY_HOUR_HEIGHT[preferences.calendarDensity];

  const [anchor, setAnchor] = useState(new Date());
  const [active, setActive] = useState<Task | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const appliedScroll = useRef<number | null>(null);

  /** Records the choice locally and in the account, so the view persists. */
  function selectView(next: View) {
    setChosenView(next);
    if (next !== preferences.calendarDefaultView) void save({ calendarDefaultView: next });
  }

  // Put the viewport at the user's preferred hour (9 AM by default) when the
  // grid opens, and again if the preference or the density changes. Earlier
  // hours stay above it, reachable by scrolling up.
  useLayoutEffect(() => {
    if (!isTimeGrid(view)) return;
    const el = gridRef.current;
    if (!el) return;
    const offset = preferences.calendarScrollHour * hourHeight;
    if (appliedScroll.current === offset) return;
    appliedScroll.current = offset;
    el.scrollTop = Math.min(offset, el.scrollHeight - el.clientHeight);
  }, [view, hourHeight, preferences.calendarScrollHour]);

  // Changing view rebuilds the grid, so allow the scroll to be re-applied.
  useEffect(() => {
    if (!isTimeGrid(view)) appliedScroll.current = null;
  }, [view]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "threeDay") return Array.from({ length: 3 }, (_, i) => addDays(anchor, i));

    const week = Array.from(
      { length: 7 },
      (_, i) =>
        addDays(startOfWeek(anchor, { weekStartsOn: preferences.weekStartsOnMonday ? 1 : 0 }), i),
    );
    if (preferences.showWeekends) return week;
    return week.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  }, [view, anchor, preferences.weekStartsOnMonday, preferences.showWeekends]);

  // Memoised so the child views' own holiday memos are not invalidated by a
  // fresh object literal on every render.
  const holidayOptions = useMemo(
    () => ({
      countries: preferences.holidayCountries,
      categories: preferences.holidayCategories,
      userHolidays,
    }),
    [preferences.holidayCountries, preferences.holidayCategories, userHolidays],
  );

  // One holiday table per visible range, rather than one lookup per cell.
  const dayHolidays = useMemo(() => holidaysByDay(days, holidayOptions), [days, holidayOptions]);

  const unscheduled = tasks.filter((t) => !t.startDateTime && !t.completed);

  /** How far the arrows move, in days, for the current view. */
  const span = view === "day" ? 1 : view === "threeDay" ? 3 : view === "month" ? 30 : 7;

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
            aria-label="Previous"
            onClick={() => setAnchor(addDays(anchor, -span))}
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
            aria-label="Next"
            onClick={() => setAnchor(addDays(anchor, span))}
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
          >
            ›
          </button>

          {/* Layout density sits beside the view switcher because they are the
              same kind of choice: how the calendar presents itself. */}
          <label className="sr-only" htmlFor="calendar-density">
            Calendar layout
          </label>
          <select
            id="calendar-density"
            value={preferences.calendarDensity}
            onChange={(e) =>
              void save({
                calendarDensity: e.target.value as typeof preferences.calendarDensity,
              })
            }
            className="ml-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink"
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>
      </div>

      {/* The view selector gets its own scrollable row: five options do not fit
          across a phone, and squeezing them would clip the labels. */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => selectView(v.id)}
            aria-pressed={view === v.id}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
              view === v.id
                ? "border-primary bg-primary text-white"
                : "border-line text-muted hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          tasks={tasks}
          weekStartsOnMonday={preferences.weekStartsOnMonday}
          holidayOptions={holidayOptions}
          onPick={(d) => {
            setAnchor(d);
            selectView("day");
          }}
        />
      ) : view === "agenda" ? (
        <AgendaList
          from={anchor}
          tasks={tasks}
          holidayOptions={holidayOptions}
          onOpen={setOpenTask}
        />
      ) : (
        <div className="flex gap-4 px-5 pb-6">
          <UnscheduledPanel tasks={unscheduled} />
          <div className="card min-w-0 flex-1 overflow-hidden">
            <div className="flex border-b border-line">
              <div className="w-14 shrink-0" />
              {days.map((day) => (
                <div key={+day} className="min-w-0 flex-1 py-2 text-center">
                  <p className="eyebrow">{format(day, "EEE")}</p>
                  <p
                    className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                      isSameDay(day, new Date()) ? "bg-primary text-white" : ""
                    }`}
                  >
                    {format(day, "d")}
                  </p>
                  {/* Holidays render as metadata beside the date. They are not
                      tasks and have no drop behaviour, so they cannot interfere
                      with scheduling, and tasks on the day still show below. */}
                  {holidaysOn(dayHolidays, day).map((h) => (
                    <HolidayPill key={h.id} holiday={h} />
                  ))}
                </div>
              ))}
            </div>

            <div ref={gridRef} className="max-h-[62vh] overflow-y-auto">
              <div className="flex" style={{ height: hourHeight * 24 }}>
                <div className="w-14 shrink-0">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      style={{ height: hourHeight }}
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
                    hourHeight={hourHeight}
                    showDetail={densityShowsDetail(preferences.calendarDensity)}
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

/** A holiday on the calendar: metadata, never a task. */
function HolidayPill({ holiday }: { holiday: HolidayEntry }) {
  const country = holidayCountry(holiday.countryCode);
  return (
    <p
      title={`${holiday.name} · ${holidayCategoryLabel(holiday.category)}`}
      className="mx-1 mt-1 truncate rounded px-1 py-0.5 text-[10px] font-semibold text-amber"
      style={{ background: "color-mix(in srgb, var(--amber) var(--tint-strength), transparent)" }}
    >
      {country ? `${country.flag} ` : ""}
      {holiday.name}
    </p>
  );
}

function DayColumn({
  day,
  tasks,
  hourHeight,
  showDetail,
  onOpen,
}: {
  day: Date;
  tasks: Task[];
  hourHeight: number;
  showDetail: boolean;
  onOpen: (t: Task) => void;
}) {
  const now = new Date();
  const isToday = isSameDay(day, now);

  return (
    <div className="relative min-w-0 flex-1 border-l border-line">
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          style={{ height: hourHeight, borderTopColor: "var(--grid-line)" }}
          className="border-t"
        />
      ))}

      <div className="absolute inset-0">
        {Array.from({ length: SLOTS_PER_DAY }, (_, s) => (
          <Slot
            key={s}
            height={(hourHeight * SLOT_MINUTES) / 60}
            start={new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, s * SLOT_MINUTES)}
          />
        ))}
      </div>

      {tasks.map((task) => (
        <Event
          key={task.id}
          task={task}
          hourHeight={hourHeight}
          showDetail={showDetail}
          onOpen={() => onOpen(task)}
        />
      ))}

      {/* Current-time line, drawn over events and ignoring pointer events so it
          cannot block a drop. */}
      {isToday && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
          style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight }}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-danger" />
          <span className="h-[1.5px] flex-1 bg-danger" />
        </div>
      )}
    </div>
  );
}

function Slot({ start, height }: { start: Date; height: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${+start}`,
    data: { type: "slot", start },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ height }}
      className={isOver ? "border-t-2 border-primary bg-primary/20" : ""}
    />
  );
}

function Event({
  task,
  hourHeight,
  showDetail,
  onOpen,
}: {
  task: Task;
  hourHeight: number;
  showDetail: boolean;
  onOpen: () => void;
}) {
  const categories = useCategoryMap();
  const move = useMove();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `event:${task.id}`,
    data: { type: "event", task },
  });

  const [resizeDelta, setResizeDelta] = useState(0);

  const start = task.startDateTime!;
  const top = ((start.getHours() * 60 + start.getMinutes()) / 60) * hourHeight;
  const baseHeight = (taskDurationMinutes(task) / 60) * hourHeight;
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

      const minutes = Math.round(((baseHeight + delta) / hourHeight) * 60);
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
          background: `color-mix(in srgb, ${css} var(--tint-strength), transparent)`,
          borderLeft: `3px solid ${css}`,
        }}
      >
        <p className="truncate text-[12px] font-bold" style={{ color: css }}>
          {task.title}
        </p>
        {showDetail && height > 40 && (
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

interface HolidayOptions {
  countries: string[];
  categories: string[];
  userHolidays: Parameters<typeof holidaysByDay>[1]["userHolidays"];
}

function MonthGrid({
  anchor,
  tasks,
  weekStartsOnMonday,
  holidayOptions,
  onPick,
}: {
  anchor: Date;
  tasks: Task[];
  weekStartsOnMonday: boolean;
  holidayOptions: HolidayOptions;
  onPick: (d: Date) => void;
}) {
  // Plain values, so the memo dependencies below stay simple expressions.
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const realDays = useMemo(
    () =>
      Array.from(
        { length: new Date(year, month + 1, 0).getDate() },
        (_, i) => new Date(year, month, i + 1),
      ),
    [year, month],
  );

  const firstWeekday = weekStartsOnMonday ? 1 : 0;
  const leading = (new Date(year, month, 1).getDay() - firstWeekday + 7) % 7;
  const cells: (Date | null)[] = [...Array.from({ length: leading }, () => null), ...realDays];

  const dayHolidays = useMemo(
    () => holidaysByDay(realDays, holidayOptions),
    [realDays, holidayOptions],
  );

  const mondayFirst = ["M", "T", "W", "T", "F", "S", "S"];
  const headers = weekStartsOnMonday ? mondayFirst : ["S", ...mondayFirst.slice(0, 6)];

  return (
    <div className="card mx-5 mb-6 p-4">
      <div className="grid grid-cols-7 pb-2">
        {headers.map((d, i) => (
          <p key={i} className="text-center text-[11px] text-muted">
            {d}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) =>
          day ? (
            <MonthCell
              key={i}
              day={day}
              tasks={tasksForDay(tasks, day)}
              holiday={holidaysOn(dayHolidays, day)[0] ?? null}
              onPick={onPick}
            />
          ) : (
            <div key={i} />
          ),
        )}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  tasks,
  holiday,
  onPick,
}: {
  day: Date;
  tasks: Task[];
  holiday: HolidayEntry | null;
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
      title={holiday ? `${holiday.name} · ${holidayCategoryLabel(holiday.category)}` : undefined}
      className={`flex aspect-square flex-col items-center justify-center rounded-xl transition ${
        isOver ? "border-2 border-primary bg-primary-soft" : "hover:bg-[var(--hover)]"
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${
          isSameDay(day, new Date())
            ? "bg-primary text-white"
            : holiday
              ? "text-amber"
              : ""
        }`}
      >
        {day.getDate()}
      </span>
      {/* The holiday's name, not just a coloured number, so the day says what
          it is without being opened. */}
      {holiday && (
        <span className="w-full truncate px-1 text-[8.5px] font-semibold text-amber">
          {holiday.name}
        </span>
      )}
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

/**
 * The agenda view: a flat list of the next two weeks, holidays included.
 *
 * A holiday never hides the day's tasks — both are listed, which is what
 * section 20 of the brief asks for.
 */
function AgendaList({
  from,
  tasks,
  holidayOptions,
  onOpen,
}: {
  from: Date;
  tasks: Task[];
  holidayOptions: HolidayOptions;
  onOpen: (t: Task) => void;
}) {
  const categories = useCategoryMap();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(from, i)), [from]);
  const dayHolidays = useMemo(
    () => holidaysByDay(days, holidayOptions),
    [days, holidayOptions],
  );

  const rows = days
    .map((day) => ({
      day,
      holidays: holidaysOn(dayHolidays, day),
      dayTasks: tasksForDay(tasks, day),
    }))
    .filter((r) => r.holidays.length > 0 || r.dayTasks.length > 0);

  if (rows.length === 0) {
    return (
      <div className="card mx-5 mb-6 px-6 py-14 text-center">
        <p className="text-sm font-semibold">Nothing scheduled</p>
        <p className="mt-1 text-[13px] text-muted">
          The next two weeks are clear. Drag a task onto the calendar to schedule it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-5 mb-6 space-y-5">
      {rows.map(({ day, holidays, dayTasks }) => (
        <section key={+day}>
          <h3 className="mb-2 text-sm font-bold">{format(day, "EEEE, MMMM d")}</h3>

          {holidays.map((h) => {
            const country = holidayCountry(h.countryCode);
            return (
              <div
                key={h.id}
                className="mb-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                style={{
                  background:
                    "color-mix(in srgb, var(--amber) var(--tint-strength), transparent)",
                }}
              >
                <PartyPopper className="h-4 w-4 shrink-0 text-amber" />
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  {country ? `${country.flag} ` : ""}
                  {h.name}
                </p>
                <span className="shrink-0 text-[11px] text-muted">
                  {holidayCategoryLabel(h.category)}
                </span>
              </div>
            );
          })}

          {dayTasks.map((t) => {
            const category = t.categoryId ? categories[t.categoryId] : undefined;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t)}
                className="mb-2 flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-[var(--hover)]"
              >
                <span className="w-16 shrink-0 text-[12.5px] font-semibold text-muted">
                  {t.startDateTime ? format(t.startDateTime, "HH:mm") : "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{t.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {[category?.name, `${taskDurationMinutes(t)} min`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {category && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: argbToCss(category.colorValue) }}
                  />
                )}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
