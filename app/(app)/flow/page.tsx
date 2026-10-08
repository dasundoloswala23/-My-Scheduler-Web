"use client";

import { Ban, CheckCircle2, Circle, CircleDot, Link2Off, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import type { StageResult } from "@/lib/flow-engine";
import { useFlowLinks, useFlowResults, useFlows } from "@/lib/flow-hooks";
import {
  addStage,
  deleteFlow,
  deleteStage,
  linkTask,
  unlinkTask,
  updateFlow,
  updateStage,
} from "@/lib/flow-repo";
import {
  FLOW_MODES,
  STAGE_STATE_LABEL,
  type FlowMode,
  type FlowStage,
  type ProjectFlow,
  type StageState,
} from "@/lib/flow-types";
import { useTasks } from "@/lib/hooks";
import { setTaskCompleted } from "@/lib/repo";
import type { Task } from "@/lib/types";

/**
 * A flow is addressed as /flow?id=… for the same reason boards are /board?id=…:
 * the site is a static export, and flow ids belong to each signed-in user.
 */
function FlowScreen() {
  const id = useSearchParams().get("id") ?? "";
  const { user } = useAuth();
  const router = useRouter();
  const flow = useFlows().find((f) => f.id === id);
  const result = useFlowResults()[id];
  const links = useFlowLinks();
  const tasks = useTasks();
  const [picking, setPicking] = useState<FlowStage | null>(null);

  if (!id || !flow || !result) {
    return (
      <div className="px-5 py-10 md:px-8">
        <p className="text-sm text-muted">{id ? "Loading flow…" : "No flow selected."}</p>
        <Link href="/flows" className="text-sm font-semibold text-primary hover:underline">
          ← All flows
        </Link>
      </div>
    );
  }
  const uid = user?.uid;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work. Try again.");
    }
  }

  return (
    <div className="px-5 py-5 md:px-8">
      <Link href="/flows" className="text-[12px] font-semibold text-muted hover:text-primary">
        ← All flows
      </Link>
      <p className="eyebrow mt-2">Project Flow</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{flow.name}</h1>
        <span className="rounded-full bg-primary-soft px-3 py-0.5 text-[12px] font-bold text-primary">
          {result.status[0].toUpperCase() + result.status.slice(1)}
        </span>
      </div>

      <p className="mt-4 text-[15px] font-bold">
        {result.completedStages}/{result.totalStages} stages complete
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-divider">
        <div className="h-full rounded-full bg-primary" style={{ width: `${result.progress * 100}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={flow.mode}
          aria-label="How stages unlock"
          onChange={(e) =>
            uid && run(() => updateFlow(uid, { ...flow, mode: e.target.value as FlowMode }))
          }
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
        >
          {FLOW_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            uid &&
            run(() =>
              updateFlow(uid, { ...flow, status: flow.status === "paused" ? "active" : "paused" } as ProjectFlow),
            )
          }
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold"
        >
          {flow.status === "paused" ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() =>
            uid &&
            run(() =>
              updateFlow(uid, {
                ...flow,
                status: flow.status === "archived" ? "active" : "archived",
              } as ProjectFlow),
            )
          }
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold"
        >
          {flow.status === "archived" ? "Unarchive" : "Archive"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!uid || !window.confirm("Delete this flow? Its stages and links go. Your tasks stay.")) return;
            await run(() => deleteFlow(uid, flow.id));
            router.push("/flows");
          }}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-danger"
        >
          Delete flow
        </button>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {FLOW_MODES.find((m) => m.id === flow.mode)?.description}
      </p>
      {result.hasCycle && (
        <p className="mt-3 text-[12.5px] text-danger">
          Some stages depend on each other in a circle, so they can never unlock. Edit their dependencies.
        </p>
      )}

      <ol className="mt-6">
        {result.stages.length === 0 && (
          <li className="py-8 text-sm text-muted">No stages yet. Add the first one.</li>
        )}
        {result.stages.map((r, i) => (
          <StageRow
            key={r.stage.id}
            r={r}
            isLast={i === result.stages.length - 1}
            flow={flow}
            allStages={result.stages}
            tasks={tasks.filter((t) =>
              links.some((l) => l.taskId === t.id && l.stageId === r.stage.id),
            )}
            onLink={() => setPicking(r.stage)}
            run={run}
            uid={uid}
          />
        ))}
      </ol>

      <button
        type="button"
        onClick={() => {
          const title = window.prompt("New stage");
          if (uid && title?.trim()) run(() => addStage(uid, flow.id, title));
        }}
        className="mt-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
      >
        Add stage
      </button>

      {picking && uid && (
        <TaskPicker
          flow={flow}
          linkedIds={new Set(links.map((l) => l.taskId))}
          tasks={tasks}
          onClose={() => setPicking(null)}
          onPick={async (taskId) => {
            setPicking(null);
            await run(() => linkTask(uid, { flowId: flow.id, stageId: picking.id, taskId }));
          }}
        />
      )}
    </div>
  );
}

const STATE_STYLE: Record<StageState, { icon: typeof Circle; color: string }> = {
  completed: { icon: CheckCircle2, color: "var(--success)" },
  active: { icon: CircleDot, color: "var(--primary)" },
  upcoming: { icon: Circle, color: "var(--primary)" },
  blocked: { icon: Ban, color: "var(--danger)" },
  locked: { icon: Lock, color: "var(--disabled)" },
};

function StageRow({
  r,
  isLast,
  flow,
  allStages,
  tasks,
  onLink,
  run,
  uid,
}: {
  r: StageResult;
  isLast: boolean;
  flow: ProjectFlow;
  allStages: StageResult[];
  tasks: Task[];
  onLink: () => void;
  run: (action: () => Promise<unknown>) => Promise<void>;
  uid: string | undefined;
}) {
  const { stage, state } = r;
  const { icon: Icon, color } = STATE_STYLE[state];
  const highlighted = state === "active";

  return (
    <li className="flex gap-3">
      <div className="flex w-7 flex-col items-center">
        <Icon className="h-6 w-6 shrink-0" style={{ color }} aria-hidden />
        {!isLast && <div className="w-0.5 flex-1 bg-line" />}
      </div>
      <div
        className={`mb-3.5 flex-1 rounded-2xl border p-3.5 ${
          highlighted
            ? "border-primary bg-primary-soft"
            : state === "blocked"
              ? "border-danger"
              : "border-transparent bg-surface"
        } ${state === "locked" ? "opacity-60" : ""}`}
        data-state={state}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold">{stage.title}</h3>
          <span className="ml-auto text-[11.5px] font-bold" style={{ color }}>
            {STAGE_STATE_LABEL[state]}
          </span>
        </div>
        <p className="text-[12.5px] text-muted">
          {r.tasks.total === 0 ? "No tasks linked" : `${r.tasks.done}/${r.tasks.total} tasks`}
          {stage.isRequired ? "" : " · optional"}
        </p>

        {tasks.map((t) => (
          <div key={t.id} className="mt-1 flex items-center gap-2 text-[13.5px]">
            <input
              type="checkbox"
              checked={t.completed}
              aria-label={`Complete ${t.title}`}
              onChange={(e) => uid && run(() => setTaskCompleted(uid, t, e.target.checked))}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className={`min-w-0 flex-1 truncate ${t.completed ? "line-through" : ""}`}>{t.title}</span>
            <button
              type="button"
              aria-label={`Unlink ${t.title}`}
              onClick={() => uid && run(() => unlinkTask(uid, t.id))}
              className="text-muted hover:text-ink"
            >
              <Link2Off className="h-4 w-4" />
            </button>
          </div>
        ))}

        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px] font-semibold">
          <StageButton onClick={onLink}>Link a task</StageButton>
          <StageButton
            onClick={() => {
              const title = window.prompt("Rename stage", stage.title);
              if (uid && title?.trim()) run(() => updateStage(uid, { ...stage, title: title.trim() }));
            }}
          >
            Rename
          </StageButton>
          {flow.mode === "dependency" && (
            <StageButton
              onClick={() => {
                const others = allStages.filter((o) => o.stage.id !== stage.id);
                const answer = window.prompt(
                  `Depends on (numbers, comma separated):\n${others
                    .map((o, i) => `${i + 1}. ${o.stage.title}`)
                    .join("\n")}`,
                  others
                    .map((o, i) => (stage.dependencyStageIds.includes(o.stage.id) ? i + 1 : null))
                    .filter(Boolean)
                    .join(", "),
                );
                if (answer === null || !uid) return;
                const picked = answer
                  .split(",")
                  .map((n) => others[Number(n.trim()) - 1]?.stage.id)
                  .filter((x): x is string => !!x);
                run(() => updateStage(uid, { ...stage, dependencyStageIds: picked }));
              }}
            >
              Dependencies
            </StageButton>
          )}
          <StageButton onClick={() => uid && run(() => updateStage(uid, { ...stage, isRequired: !stage.isRequired }))}>
            {stage.isRequired ? "Make optional" : "Make required"}
          </StageButton>
          <StageButton
            onClick={() =>
              uid &&
              run(() =>
                updateStage(uid, {
                  ...stage,
                  manualStatus: stage.manualStatus === "completed" ? null : "completed",
                }),
              )
            }
          >
            {stage.manualStatus === "completed" ? "Reopen stage" : "Mark complete"}
          </StageButton>
          <StageButton
            onClick={() =>
              uid &&
              run(() =>
                updateStage(uid, {
                  ...stage,
                  manualStatus: stage.manualStatus === "blocked" ? null : "blocked",
                }),
              )
            }
          >
            {stage.manualStatus === "blocked" ? "Unblock" : "Mark blocked"}
          </StageButton>
          <StageButton
            danger
            onClick={() => {
              if (uid && window.confirm(`Delete "${stage.title}"? Its tasks stay and are just unlinked.`)) {
                run(() => deleteStage(uid, stage));
              }
            }}
          >
            Delete
          </StageButton>
        </div>
      </div>
    </li>
  );
}

function StageButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border border-line px-2.5 py-1 hover:border-primary ${danger ? "text-danger" : ""}`}
    >
      {children}
    </button>
  );
}

/** Lists existing tasks that are not already in a flow, so a task can never be in two places. */
function TaskPicker({
  flow,
  tasks,
  linkedIds,
  onPick,
  onClose,
}: {
  flow: ProjectFlow;
  tasks: Task[];
  linkedIds: Set<string>;
  onPick: (taskId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const candidates = tasks
    .filter((t) => !linkedIds.has(t.id) && !t.parentTaskId)
    .filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => {
      const ab = a.boardId === flow.boardId ? 0 : 1;
      const bb = b.boardId === flow.boardId ? 0 : 1;
      return ab !== bb ? ab - bb : a.title.localeCompare(b.title);
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Link an existing task"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <h2 className="text-lg font-bold">Link an existing task</h2>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <ul className="mt-3 divide-y divide-divider">
          {candidates.length === 0 && <li className="py-4 text-sm text-muted">No tasks to link.</li>}
          {candidates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                className="w-full px-1 py-2.5 text-left text-sm hover:bg-[var(--hover)]"
              >
                {t.title}
                {t.completed && <span className="ml-2 text-[11.5px] text-muted">Completed</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 text-right">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FlowPage() {
  // useSearchParams needs a Suspense boundary when the page is prerendered.
  return (
    <Suspense fallback={<div className="px-5 py-10 text-sm text-muted">Loading flow…</div>}>
      <FlowScreen />
    </Suspense>
  );
}
