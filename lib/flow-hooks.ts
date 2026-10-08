"use client";

import { useMemo } from "react";

import { evaluateFlow, type FlowResult, type TaskCounts } from "./flow-engine";
import { flowPaths, mapFlow, mapLink, mapStage } from "./flow-repo";
import type { FlowStage, FlowTaskLink, ProjectFlow } from "./flow-types";
import { useCollection, useTasks } from "./hooks";

export function useFlows(): ProjectFlow[] {
  const flows = useCollection<ProjectFlow>(flowPaths.flows, mapFlow as never);
  return useMemo(
    () => [...flows].sort((a, b) => +(b.createdAt ?? 0) - +(a.createdAt ?? 0)),
    [flows],
  );
}

export function useFlowStages(): FlowStage[] {
  const stages = useCollection<FlowStage>(flowPaths.stages, mapStage as never);
  return useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);
}

export function useFlowLinks(): FlowTaskLink[] {
  return useCollection<FlowTaskLink>(flowPaths.links, mapLink as never);
}

/**
 * Every flow evaluated by the engine against the live tasks. Screens read this
 * rather than the stored copy, so what they show is always consistent with the
 * tasks on screen, even for the instant before a recompute has been written.
 */
export function useFlowResults(): Record<string, FlowResult> {
  const flows = useFlows();
  const stages = useFlowStages();
  const links = useFlowLinks();
  const tasks = useTasks();

  return useMemo(() => {
    const completed = new Map(tasks.map((t) => [t.id, t.completed]));
    const out: Record<string, FlowResult> = {};
    for (const flow of flows) {
      const counts: Record<string, TaskCounts> = {};
      for (const link of links) {
        if (link.flowId !== flow.id) continue;
        const done = completed.get(link.taskId);
        if (done === undefined) continue; // task gone: the link counts for nothing
        const c = counts[link.stageId] ?? { done: 0, total: 0 };
        counts[link.stageId] = { done: c.done + (done ? 1 : 0), total: c.total + 1 };
      }
      out[flow.id] = evaluateFlow(
        flow,
        stages.filter((s) => s.flowId === flow.id),
        counts,
      );
    }
    return out;
  }, [flows, stages, links, tasks]);
}

/** For each linked task, its flow's progress (stages done / stages in all): the "Flow 4/9" badge. */
export function useTaskFlowBadges(): Record<string, { done: number; total: number }> {
  const links = useFlowLinks();
  const results = useFlowResults();
  return useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const l of links) {
      const r = results[l.flowId];
      if (r) out[l.taskId] = { done: r.completedStages, total: r.totalStages };
    }
    return out;
  }, [links, results]);
}
