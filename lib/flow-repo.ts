import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "./firebase";
import { evaluateFlow, findCycle, type FlowResult, type TaskCounts } from "./flow-engine";
import type {
  FlowMode,
  FlowStage,
  FlowStatus,
  FlowTaskLink,
  ManualStageStatus,
  ProjectFlow,
  StageState,
} from "./flow-types";
import { toDate } from "./types";

/**
 * Stores Project Flows under `users/{uid}`, so the same owner-only rule that
 * protects tasks protects them. The same documents the Flutter app writes
 * (lib/core/flows/flow_repository.dart). Tasks are never copied here: a link only
 * points at the real task.
 */
const flowsCol = (uid: string) => collection(db, "users", uid, "projectFlows");
const stagesCol = (uid: string) => collection(db, "users", uid, "flowStages");
const linksCol = (uid: string) => collection(db, "users", uid, "flowTaskLinks");
const tasksCol = (uid: string) => collection(db, "users", uid, "tasks");

type Snap = QueryDocumentSnapshot<DocumentData>;

const oneOf = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export function mapFlow(snap: Snap): ProjectFlow {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name ?? "Untitled flow",
    description: d.description ?? "",
    icon: d.icon ?? "rocket_launch",
    colorValue: typeof d.colorValue === "number" ? d.colorValue : 0xff7c5cfc,
    boardId: d.boardId ?? null,
    categoryId: d.categoryId ?? null,
    mode: oneOf<FlowMode>(["sequential", "flexible", "dependency"], d.mode, "sequential"),
    status: oneOf<FlowStatus>(["active", "completed", "paused", "archived"], d.status, "active"),
    currentStageId: d.currentStageId ?? null,
    progress: typeof d.progress === "number" ? d.progress : 0,
    startDate: toDate(d.startDate),
    dueDate: toDate(d.dueDate),
    createdAt: toDate(d.createdAt),
    completedAt: toDate(d.completedAt),
  };
}

export function mapStage(snap: Snap): FlowStage {
  const d = snap.data();
  return {
    id: snap.id,
    flowId: d.flowId ?? "",
    title: d.title ?? "Stage",
    description: d.description ?? "",
    position: typeof d.position === "number" ? d.position : 0,
    startDate: toDate(d.startDate),
    dueDate: toDate(d.dueDate),
    priority: d.priority ?? "medium",
    colorValue: typeof d.colorValue === "number" ? d.colorValue : null,
    isRequired: d.isRequired ?? true,
    dependencyStageIds: Array.isArray(d.dependencyStageIds)
      ? d.dependencyStageIds.filter((x: unknown): x is string => typeof x === "string")
      : [],
    autoCompleteWhenTasksDone: d.autoCompleteWhenTasksDone ?? true,
    manualStatus:
      d.manualStatus === "completed" || d.manualStatus === "blocked"
        ? (d.manualStatus as ManualStageStatus)
        : null,
    state: oneOf<StageState>(["locked", "upcoming", "active", "completed", "blocked"], d.status, "locked"),
    completedAt: toDate(d.completedAt),
  };
}

export function mapLink(snap: Snap): FlowTaskLink {
  const d = snap.data();
  return {
    taskId: snap.id,
    flowId: d.flowId ?? "",
    stageId: d.stageId ?? "",
    position: typeof d.position === "number" ? d.position : 0,
  };
}

export const flowPaths = { flows: flowsCol, stages: stagesCol, links: linksCol };

const ts = (d: Date | null) => (d ? Timestamp.fromDate(d) : null);

function flowToJson(f: Omit<ProjectFlow, "id" | "createdAt">): DocumentData {
  return {
    name: f.name,
    description: f.description,
    icon: f.icon,
    colorValue: f.colorValue,
    boardId: f.boardId,
    categoryId: f.categoryId,
    mode: f.mode,
    status: f.status,
    currentStageId: f.currentStageId,
    progress: f.progress,
    startDate: ts(f.startDate),
    dueDate: ts(f.dueDate),
    completedAt: ts(f.completedAt),
  };
}

function stageToJson(s: Omit<FlowStage, "id">): DocumentData {
  return {
    flowId: s.flowId,
    title: s.title,
    description: s.description,
    position: s.position,
    startDate: ts(s.startDate),
    dueDate: ts(s.dueDate),
    priority: s.priority,
    colorValue: s.colorValue,
    isRequired: s.isRequired,
    dependencyStageIds: s.dependencyStageIds,
    autoCompleteWhenTasksDone: s.autoCompleteWhenTasksDone,
    manualStatus: s.manualStatus,
    status: s.state,
    completedAt: ts(s.completedAt),
  };
}

export function newStage(flowId: string, title: string, position: number): Omit<FlowStage, "id"> {
  return {
    flowId,
    title: title.trim(),
    description: "",
    position,
    startDate: null,
    dueDate: null,
    priority: "medium",
    colorValue: null,
    isRequired: true,
    dependencyStageIds: [],
    autoCompleteWhenTasksDone: true,
    manualStatus: null,
    state: "locked",
    completedAt: null,
  };
}

// -------------------------------------------------------------------- flows

/** Creates a flow with one stage per title, in one batch. No tasks are made. */
export async function createFlow(
  uid: string,
  input: { name: string; boardId?: string | null; categoryId?: string | null; mode: FlowMode; icon?: string },
  stageTitles: string[] = [],
): Promise<string> {
  const ref = doc(flowsCol(uid));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...flowToJson({
      name: input.name.trim(),
      description: "",
      icon: input.icon ?? "rocket_launch",
      colorValue: 0xff7c5cfc,
      boardId: input.boardId ?? null,
      categoryId: input.categoryId ?? null,
      mode: input.mode,
      status: "active",
      currentStageId: null,
      progress: 0,
      startDate: null,
      dueDate: null,
      completedAt: null,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  stageTitles.forEach((title, i) => {
    batch.set(doc(stagesCol(uid)), {
      ...stageToJson(newStage(ref.id, title, (i + 1) * 1000)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  await recompute(uid, ref.id);
  return ref.id;
}

export async function updateFlow(uid: string, flow: ProjectFlow) {
  await updateDoc(doc(flowsCol(uid), flow.id), {
    ...flowToJson(flow),
    updatedAt: serverTimestamp(),
  });
  await recompute(uid, flow.id);
}

/** Deletes the flow, its stages and its links. The linked tasks are not touched. */
export async function deleteFlow(uid: string, flowId: string) {
  const stages = await getDocs(query(stagesCol(uid), where("flowId", "==", flowId)));
  const links = await getDocs(query(linksCol(uid), where("flowId", "==", flowId)));
  const batch = writeBatch(db);
  for (const d of [...stages.docs, ...links.docs]) batch.delete(d.ref);
  batch.delete(doc(flowsCol(uid), flowId));
  await batch.commit();
}

// ------------------------------------------------------------------- stages

export async function addStage(uid: string, flowId: string, title: string) {
  const existing = await getDocs(query(stagesCol(uid), where("flowId", "==", flowId)));
  const last = existing.docs.reduce(
    (m, d) => Math.max(m, typeof d.data().position === "number" ? d.data().position : 0),
    0,
  );
  const ref = doc(stagesCol(uid));
  await setDoc(ref, {
    ...stageToJson(newStage(flowId, title, last + 1000)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await recompute(uid, flowId);
  return ref.id;
}

/**
 * Saves a stage. In dependency mode, an edit that would make the stages depend
 * on each other in a circle is refused.
 */
export async function updateStage(uid: string, stage: FlowStage) {
  const flowSnap = await getDoc(doc(flowsCol(uid), stage.flowId));
  if (flowSnap.exists() && mapFlow(flowSnap as Snap).mode === "dependency") {
    const siblings = (await getDocs(query(stagesCol(uid), where("flowId", "==", stage.flowId)))).docs
      .map((d) => mapStage(d as Snap))
      .map((s) => (s.id === stage.id ? stage : s));
    if (findCycle(siblings).size > 0) {
      throw new Error("Those dependencies would make the stages wait on each other.");
    }
  }
  const { id, ...rest } = stage;
  await updateDoc(doc(stagesCol(uid), id), { ...stageToJson(rest), updatedAt: serverTimestamp() });
  await recompute(uid, stage.flowId);
}

/** Removes a stage, unlinks its tasks (they stay), and drops it from other stages' dependencies. */
export async function deleteStage(uid: string, stage: FlowStage) {
  const links = await getDocs(query(linksCol(uid), where("stageId", "==", stage.id)));
  const siblings = await getDocs(query(stagesCol(uid), where("flowId", "==", stage.flowId)));
  const batch = writeBatch(db);
  for (const l of links.docs) batch.delete(l.ref);
  for (const d of siblings.docs) {
    const s = mapStage(d as Snap);
    if (s.dependencyStageIds.includes(stage.id)) {
      batch.update(d.ref, {
        dependencyStageIds: s.dependencyStageIds.filter((x) => x !== stage.id),
      });
    }
  }
  batch.delete(doc(stagesCol(uid), stage.id));
  await batch.commit();
  await recompute(uid, stage.flowId);
}

// -------------------------------------------------------------------- links

/** Links an existing task to a stage; linking an already-linked task moves it. */
export async function linkTask(uid: string, p: { flowId: string; stageId: string; taskId: string }) {
  const stage = await getDoc(doc(stagesCol(uid), p.stageId));
  if (!stage.exists() || stage.data().flowId !== p.flowId) {
    throw new Error("That stage does not belong to this flow.");
  }
  if (!(await getDoc(doc(tasksCol(uid), p.taskId))).exists()) {
    throw new Error("That task no longer exists.");
  }
  const previous = await getDoc(doc(linksCol(uid), p.taskId));
  const previousFlow = previous.exists() ? (previous.data().flowId as string) : null;

  await setDoc(doc(linksCol(uid), p.taskId), {
    flowId: p.flowId,
    stageId: p.stageId,
    taskId: p.taskId,
    position: 0,
    createdAt: previous.exists() ? (previous.data().createdAt ?? serverTimestamp()) : serverTimestamp(),
  });

  await recompute(uid, p.flowId);
  if (previousFlow && previousFlow !== p.flowId) await recompute(uid, previousFlow);
}

export async function unlinkTask(uid: string, taskId: string) {
  const link = await getDoc(doc(linksCol(uid), taskId));
  if (!link.exists()) return;
  const flowId = link.data().flowId as string | undefined;
  await deleteDoc(link.ref);
  if (flowId) await recompute(uid, flowId);
}

// ------------------------------------------------------------ derived state

/**
 * Evaluates a flow from its stages and tasks and stores the result where it
 * differs from what is stored. Writes nothing when nothing changed, so running it
 * twice is harmless. The engine is the source of truth and the screens evaluate
 * it live, so the stored copy only serves queries and other devices; two
 * recomputes racing cannot leave a wrong answer on screen.
 */
export async function recompute(uid: string, flowId: string): Promise<FlowResult | null> {
  const flowDoc = await getDoc(doc(flowsCol(uid), flowId));
  if (!flowDoc.exists()) return null;
  const flow = mapFlow(flowDoc as Snap);

  const stages = (await getDocs(query(stagesCol(uid), where("flowId", "==", flowId)))).docs.map((d) =>
    mapStage(d as Snap),
  );
  const links = (await getDocs(query(linksCol(uid), where("flowId", "==", flowId)))).docs.map((d) =>
    mapLink(d as Snap),
  );

  const counts: Record<string, TaskCounts> = {};
  for (const link of links) {
    const task = await getDoc(doc(tasksCol(uid), link.taskId));
    if (!task.exists()) continue; // a link whose task is gone counts for nothing
    const c = counts[link.stageId] ?? { done: 0, total: 0 };
    counts[link.stageId] = { done: c.done + (task.data().completed ? 1 : 0), total: c.total + 1 };
  }

  const result = evaluateFlow(flow, stages, counts);
  const batch = writeBatch(db);
  let writes = 0;

  for (const r of result.stages) {
    const shouldBeDone = r.state === "completed";
    if (r.stage.state !== r.state || (r.stage.completedAt !== null) !== shouldBeDone) {
      batch.update(doc(stagesCol(uid), r.stage.id), {
        status: r.state,
        completedAt: shouldBeDone ? (r.stage.completedAt ?? Timestamp.now()) : null,
      });
      writes++;
    }
  }

  const finished = result.status === "completed";
  if (
    flow.currentStageId !== result.currentStageId ||
    Math.abs(flow.progress - result.progress) > 1e-9 ||
    flow.status !== result.status ||
    (flow.completedAt !== null) !== finished
  ) {
    batch.update(doc(flowsCol(uid), flowId), {
      currentStageId: result.currentStageId,
      progress: result.progress,
      status: result.status,
      completedAt: finished ? (flow.completedAt ?? Timestamp.now()) : null,
      updatedAt: serverTimestamp(),
    });
    writes++;
  }

  if (writes > 0) await batch.commit();
  return result;
}

/** Recomputes the flow a task belongs to, if any. Called after the task changed. */
export async function recomputeForTask(uid: string, taskId: string) {
  const link = await getDoc(doc(linksCol(uid), taskId));
  const flowId = link.exists() ? (link.data().flowId as string | undefined) : undefined;
  if (flowId) await recompute(uid, flowId);
}
