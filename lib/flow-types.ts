/**
 * Project Flow is a planning layer over real tasks. It holds stages and links to
 * tasks; it never holds tasks of its own, so a task lives once, on its board and
 * on the calendar, and a flow only points at it. These shapes mirror the Flutter
 * app's models (lib/models/project_flow.dart) because both clients read and write
 * the same documents under users/{uid}:
 *
 *   projectFlows/{flowId}   the flow
 *   flowStages/{stageId}    its stages (each carries flowId)
 *   flowTaskLinks/{taskId}  which stage a task belongs to; the id is the task id,
 *                           so a task has at most one link
 */

export type FlowStatus = "active" | "completed" | "paused" | "archived";
export type FlowMode = "sequential" | "flexible" | "dependency";

/** Always derived by the engine; never trusted from storage. */
export type StageState = "locked" | "upcoming" | "active" | "completed" | "blocked";

/** A stage the user has settled by hand. Everything else is derived. */
export type ManualStageStatus = "completed" | "blocked";

export interface ProjectFlow {
  id: string;
  name: string;
  description: string;
  icon: string;
  colorValue: number;
  boardId: string | null;
  categoryId: string | null;
  mode: FlowMode;
  status: FlowStatus;
  /** Cached by the last recompute; screens evaluate the engine live instead. */
  currentStageId: string | null;
  progress: number;
  startDate: Date | null;
  dueDate: Date | null;
  createdAt: Date | null;
  completedAt: Date | null;
}

export interface FlowStage {
  id: string;
  flowId: string;
  title: string;
  description: string;
  position: number;
  startDate: Date | null;
  dueDate: Date | null;
  priority: string;
  colorValue: number | null;
  isRequired: boolean;
  dependencyStageIds: string[];
  autoCompleteWhenTasksDone: boolean;
  manualStatus: ManualStageStatus | null;
  /** The state at the last recompute (stored as `status`). */
  state: StageState;
  completedAt: Date | null;
}

export interface FlowTaskLink {
  taskId: string;
  flowId: string;
  stageId: string;
  position: number;
}

export const FLOW_MODES: { id: FlowMode; label: string; description: string }[] = [
  {
    id: "sequential",
    label: "Sequential",
    description: "Each stage unlocks when the one before it is complete.",
  },
  { id: "flexible", label: "Flexible", description: "Any stage can be worked on at any time." },
  {
    id: "dependency",
    label: "Dependency",
    description: "A stage unlocks when the stages it depends on are complete.",
  },
];

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  locked: "Locked",
  upcoming: "Up next",
  active: "Active",
  completed: "Completed",
  blocked: "Blocked",
};
