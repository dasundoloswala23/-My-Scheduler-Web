import type { FlowStage, FlowStatus, ProjectFlow, StageState } from "./flow-types";

/**
 * The rules of a Project Flow, with no Firebase in them. A port of the Flutter
 * app's FlowEngine (lib/core/flows/flow_engine.dart); the tests use the same
 * vectors, so both clients decide every stage's state identically.
 *
 * Given a flow, its stages and how many of each stage's tasks are done, it
 * decides every stage's state, the flow's progress and status. Because it is a
 * pure function of those inputs, a screen can call it on every render and two
 * devices always agree, whatever order their writes arrived in.
 */

export interface TaskCounts {
  done: number;
  total: number;
}

const NO_TASKS: TaskCounts = { done: 0, total: 0 };

export interface StageResult {
  stage: FlowStage;
  state: StageState;
  tasks: TaskCounts;
}

export interface FlowResult {
  /** In position order. */
  stages: StageResult[];
  /** The flow's status after taking its stages into account. */
  status: FlowStatus;
  completedStages: number;
  totalStages: number;
  /** The first active stage, or null when none is. */
  currentStageId: string | null;
  /** Stages caught in a dependency cycle. Empty when the dependencies are sound. */
  cycleStageIds: Set<string>;
  /** Completed stages over all stages, 0 to 1. */
  progress: number;
  hasCycle: boolean;
}

export function evaluateFlow(
  flow: Pick<ProjectFlow, "mode" | "status">,
  stages: FlowStage[],
  counts: Record<string, TaskCounts> = {},
): FlowResult {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  const byId = new Map(ordered.map((s) => [s.id, s]));
  const cycle = flow.mode === "dependency" ? findCycle(ordered) : new Set<string>();

  const isDone = (s: FlowStage): boolean => {
    if (s.manualStatus === "completed") return true;
    const c = counts[s.id] ?? NO_TASKS;
    return s.autoCompleteWhenTasksDone && c.total > 0 && c.done === c.total;
  };

  const states = new Map<string, StageState>();
  // Completed stages first: every other state depends on which are complete.
  for (const s of ordered) if (isDone(s)) states.set(s.id, "completed");

  const prerequisites = (s: FlowStage, index: number): string[] => {
    switch (flow.mode) {
      case "flexible":
        return [];
      case "sequential":
        return ordered.slice(0, index).filter((p) => p.isRequired).map((p) => p.id);
      case "dependency":
        return s.dependencyStageIds.filter((d) => byId.has(d));
    }
  };

  // A stage's state can depend on others' states, so repeat until nothing
  // changes. Bounded by the number of stages; cycles are handled apart.
  for (let pass = 0; pass <= ordered.length; pass++) {
    let changed = false;
    ordered.forEach((s, i) => {
      if (states.get(s.id) === "completed") return;
      const next = stateFor(s, prerequisites(s, i), states, cycle.has(s.id));
      if (states.get(s.id) !== next) {
        states.set(s.id, next);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const results: StageResult[] = ordered.map((s) => ({
    stage: s,
    state: states.get(s.id) ?? "locked",
    tasks: counts[s.id] ?? NO_TASKS,
  }));

  const completed = results.filter((r) => r.state === "completed").length;
  const allRequiredDone =
    results.length > 0 && results.filter((r) => r.stage.isRequired).every((r) => r.state === "completed");

  // The user's pause or archive wins over anything derived.
  const status: FlowStatus =
    flow.status === "paused" || flow.status === "archived"
      ? flow.status
      : allRequiredDone
        ? "completed"
        : "active";

  return {
    stages: results,
    status,
    completedStages: completed,
    totalStages: results.length,
    currentStageId: results.find((r) => r.state === "active")?.stage.id ?? null,
    cycleStageIds: cycle,
    progress: results.length === 0 ? 0 : completed / results.length,
    hasCycle: cycle.size > 0,
  };
}

function stateFor(
  s: FlowStage,
  prerequisites: string[],
  states: Map<string, StageState>,
  inCycle: boolean,
): StageState {
  if (s.manualStatus === "blocked") return "blocked";
  // A stage in a dependency cycle can never unlock, and the cycle is shown.
  if (inCycle) return "blocked";

  const unmet = prerequisites.filter((p) => states.get(p) !== "completed");
  if (unmet.length === 0) return "active";
  // Waiting on something blocked: blocked too, so the cause is visible.
  if (unmet.some((p) => states.get(p) === "blocked")) return "blocked";
  // Waiting only on stages in progress right now: this one is next.
  if (unmet.every((p) => states.get(p) === "active")) return "upcoming";
  return "locked";
}

/** The stages on a dependency cycle (including one that depends on itself). */
export function findCycle(stages: FlowStage[]): Set<string> {
  const ids = new Set(stages.map((s) => s.id));
  const deps = new Map(stages.map((s) => [s.id, s.dependencyStageIds.filter((d) => ids.has(d))]));

  // A stage is on a cycle exactly when it can reach itself.
  const reaches = (from: string, target: string): boolean => {
    const seen = new Set<string>();
    const stack = [...(deps.get(from) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === target) return true;
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(...(deps.get(n) ?? []));
      }
    }
    return false;
  };

  return new Set(stages.filter((s) => reaches(s.id, s.id)).map((s) => s.id));
}

/** Whether making `stageId` depend on `dependsOnId` would create a cycle. */
export function wouldCreateCycle(stages: FlowStage[], stageId: string, dependsOnId: string): boolean {
  if (stageId === dependsOnId) return true;
  const changed = stages.map((s) =>
    s.id === stageId
      ? { ...s, dependencyStageIds: [...new Set([...s.dependencyStageIds, dependsOnId])] }
      : s,
  );
  return findCycle(changed).size > 0;
}

// ------------------------------------------------------------------- filters

export type FlowFilter = "all" | "active" | "blocked" | "completed" | "dueSoon";

export const FLOW_FILTERS: { id: FlowFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "blocked", label: "Blocked" },
  { id: "completed", label: "Completed" },
  { id: "dueSoon", label: "Due soon" },
];

/** How many days ahead "due soon" looks. An unfinished flow already past due counts too. */
export const DUE_SOON_DAYS = 7;

export const isBlocked = (r: FlowResult) =>
  r.status === "active" && r.stages.some((s) => s.state === "blocked");

export function isDueSoon(flow: Pick<ProjectFlow, "dueDate">, r: FlowResult, now: Date): boolean {
  if (!flow.dueDate || r.status !== "active") return false;
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DUE_SOON_DAYS + 1);
  return +flow.dueDate < +cutoff;
}

/** The flows that pass the filter, search text and board/category choices. */
export function filterFlows(options: {
  flows: ProjectFlow[];
  results: Record<string, FlowResult>;
  filter: FlowFilter;
  search?: string;
  boardId?: string | null;
  categoryId?: string | null;
  now: Date;
}): ProjectFlow[] {
  const q = (options.search ?? "").trim().toLowerCase();
  return options.flows.filter((f) => {
    const r = options.results[f.id];
    const status = r?.status ?? f.status;
    const passes =
      options.filter === "all" ||
      (options.filter === "active" && status === "active") ||
      (options.filter === "completed" && status === "completed") ||
      (options.filter === "blocked" && !!r && isBlocked(r)) ||
      (options.filter === "dueSoon" && !!r && isDueSoon(f, r, options.now));
    return (
      passes &&
      (!options.boardId || f.boardId === options.boardId) &&
      (!options.categoryId || f.categoryId === options.categoryId) &&
      (!q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))
    );
  });
}
