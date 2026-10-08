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
import { useState } from "react";

import { TaskCardBody } from "@/components/task-card";
import { useTasks } from "@/lib/hooks";
import type { Priority, Task } from "@/lib/types";
import { useMove } from "@/lib/use-move";

const QUADRANTS: { priority: Priority; title: string; subtitle: string; color: string }[] = [
  { priority: "high", title: "Do first", subtitle: "Urgent & important", color: "var(--danger)" },
  { priority: "medium", title: "Schedule", subtitle: "Important, not urgent", color: "var(--blue)" },
  { priority: "low", title: "Delegate", subtitle: "Urgent, not important", color: "var(--amber)" },
  { priority: "none", title: "Later", subtitle: "Neither", color: "var(--muted)" },
];

/** Each quadrant maps to a priority, so a drag between them is a priority change. */
export default function EisenhowerPage() {
  const tasks = useTasks().filter((t) => !t.completed);
  const move = useMove();
  const [active, setActive] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function onDragStart(e: DragStartEvent) {
    setActive((e.active.data.current?.task as Task) ?? null);
  }

  async function onDragEnd(e: DragEndEvent) {
    const task = e.active.data.current?.task as Task | undefined;
    setActive(null);
    if (!task || !e.over) return;

    const priority = (e.over.data.current as { priority?: Priority })?.priority;
    if (!priority || priority === task.priority) return;

    const quadrant = QUADRANTS.find((q) => q.priority === priority)!;
    await move(task, { priority }, `Moved to ${quadrant.title}`);
  }

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">MyPlanScheduler</p>
      <h1 className="mb-4 text-3xl font-bold">Eisenhower matrix</h1>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {QUADRANTS.map((q) => (
            <Quadrant
              key={q.priority}
              {...q}
              tasks={tasks.filter((t) => t.priority === q.priority)}
            />
          ))}
        </div>

        <DragOverlay>
          {active && (
            <div className="w-[260px] rotate-1 shadow-2xl">
              <TaskCardBody task={active} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Quadrant({
  priority,
  title,
  subtitle,
  color,
  tasks,
}: {
  priority: Priority;
  title: string;
  subtitle: string;
  color: string;
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `quadrant:${priority}`, data: { priority } });

  return (
    <section
      ref={setNodeRef}
      className="card min-h-[260px] p-4 transition"
      style={
        isOver
          ? { borderColor: color, borderWidth: 2, background: `color-mix(in srgb, ${color} 8%, transparent)` }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <h2 className="text-sm font-bold" style={{ color }}>
          {title}
        </h2>
        <span className="ml-auto text-[11px] text-muted">{tasks.length}</span>
      </div>
      <p className="text-[11px] text-muted">{subtitle}</p>

      <div className="mt-3 space-y-2">
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.35 : 1,
      }}
      className="cursor-grab touch-none active:cursor-grabbing"
    >
      <TaskCardBody task={task} />
    </div>
  );
}
