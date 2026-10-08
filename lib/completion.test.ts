import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextOccurrenceId, planCompletion, planReopen } from "./completion.ts";
import { COMPLETE_KIND, DEFAULT_LISTS, isCompleteList, planListMove } from "./lists.ts";
import type { Task, TaskList } from "./types";

/**
 * Mirrors the Flutter app's completion tests (test/completion_test.dart): the
 * two clients must give the same result for the same task.
 */

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Weekly report",
    description: "",
    boardId: "b1",
    listId: "todo",
    categoryId: null,
    parentTaskId: null,
    position: 1000,
    completed: false,
    priority: "none",
    startDateTime: null,
    endDateTime: null,
    recurrence: "none",
    reminderMinutesBefore: null,
    reminderOffsets: [],
    reminders: [],
    attachmentCount: 0,
    attachmentPreview: null,
    subtasks: [],
    attachments: [],
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    completedFromListId: null,
    spawnedNextTaskId: null,
    version: 1,
    ...partial,
  };
}

const now = new Date(2030, 0, 7, 12, 0);
const ctx = { completeListId: "done", topPosition: -500, now };

describe("completing a task", () => {
  it("moves it to the Complete list and remembers where it came from", () => {
    const { patch } = planCompletion(task(), ctx);
    assert.equal(patch.completed, true);
    assert.equal(patch.listId, "done");
    assert.equal(patch.position, -500);
    assert.equal(patch.completedFromListId, "todo");
    assert.deepEqual(patch.completedAt, now);
  });

  it("a board with no Complete list yet just marks the task completed in place", () => {
    const { patch } = planCompletion(task(), { ...ctx, completeListId: null });
    assert.equal(patch.completed, true);
    assert.equal("listId" in patch, false);
  });

  it("an already-Complete task keeps the origin that was recorded", () => {
    const { patch } = planCompletion(
      task({ listId: "done", completedFromListId: "waiting" }),
      ctx,
    );
    assert.equal(patch.completedFromListId, "waiting");
  });

  it("a one-off task spawns nothing", () => {
    assert.equal(planCompletion(task(), ctx).next, null);
  });
});

describe("a repeating task", () => {
  const start = new Date(2030, 0, 7, 9, 0);
  const repeating = task({
    recurrence: "weekly",
    startDateTime: start,
    endDateTime: new Date(2030, 0, 7, 10, 30),
    subtasks: [{ id: "s1", title: "Draft", done: true, position: 0 }],
    attachments: ["x.pdf"],
    attachmentCount: 1,
    reminders: [{ id: "r1", taskId: "t1" } as never],
  });

  it("leaves the current occurrence in Complete and puts the next in the ORIGINAL list", () => {
    const { patch, next } = planCompletion(repeating, ctx);
    assert.equal(patch.listId, "done");
    assert.equal(next!.overrides.listId, "todo");
    assert.deepEqual(next!.overrides.startDateTime, new Date(2030, 0, 14, 9, 0));
    assert.deepEqual(next!.overrides.endDateTime, new Date(2030, 0, 14, 10, 30), "same length");
  });

  it("the next occurrence is fresh: not done, no files, subtasks reset, reminders retargeted", () => {
    const { next } = planCompletion(repeating, ctx);
    const o = next!.overrides;
    assert.equal(o.completed, false);
    assert.equal(o.completedAt, null);
    assert.equal(o.completedFromListId, null);
    assert.deepEqual(o.attachments, []);
    assert.equal(o.attachmentCount, 0);
    assert.equal((o.subtasks as { done: boolean }[])[0].done, false);
    assert.equal((o.reminders as { taskId: string }[])[0].taskId, next!.id);
    assert.equal(o.version, 1);
  });

  it("its id is derived from the task and the occurrence, and records itself on the original", () => {
    const { patch, next } = planCompletion(repeating, ctx);
    assert.equal(next!.id, `t1-next-${start.getTime()}`);
    assert.equal(patch.spawnedNextTaskId, next!.id);
  });

  it("completing the same stale snapshot twice yields the SAME next id, so only one document exists", () => {
    const a = planCompletion(repeating, ctx).next!.id;
    const b = planCompletion(repeating, { ...ctx, now: new Date(2030, 0, 7, 12, 5) }).next!.id;
    assert.equal(a, b);
  });

  it("a task that already spawned one does not spawn another", () => {
    const { patch, next } = planCompletion(task({ ...repeating, spawnedNextTaskId: "t1-next-1" }), ctx);
    assert.equal(next, null);
    assert.equal("spawnedNextTaskId" in patch, false);
  });

  it("a repeating task with no date has nothing to repeat from", () => {
    assert.equal(planCompletion(task({ recurrence: "daily" }), ctx).next, null);
  });

  it("different occurrences of one series have different ids", () => {
    assert.notEqual(
      nextOccurrenceId("t1", new Date(2030, 0, 7, 9)),
      nextOccurrenceId("t1", new Date(2030, 0, 14, 9)),
    );
  });

  it("several cycles never produce a duplicate id", () => {
    const ids = new Set<string>();
    let current = repeating;
    for (let i = 0; i < 20; i++) {
      const { next } = planCompletion(current, ctx);
      assert.ok(!ids.has(next!.id), `duplicate id after ${i} cycles`);
      ids.add(next!.id);
      current = task({
        ...repeating,
        id: next!.id,
        startDateTime: next!.overrides.startDateTime as Date,
        endDateTime: next!.overrides.endDateTime as Date,
      });
    }
    assert.equal(ids.size, 20);
  });
});

describe("re-opening", () => {
  const completed = task({
    completed: true,
    listId: "done",
    completedFromListId: "waiting",
    recurrence: "weekly",
    startDateTime: new Date(2030, 0, 7, 9),
    spawnedNextTaskId: "t1-next-1",
  });
  const base = { originStillExists: true, firstOrdinaryListId: "inbox", topPosition: -9 };

  it("returns to the list it came from", () => {
    const { patch } = planReopen(completed, { ...base, spawned: null });
    assert.equal(patch.listId, "waiting");
    assert.equal(patch.completed, false);
    assert.equal(patch.completedAt, null);
    assert.equal(patch.completedFromListId, null);
  });

  it("goes where the user dropped it when they dragged it out of Complete", () => {
    const { patch } = planReopen(completed, { ...base, toListId: "somewhere", spawned: null });
    assert.equal(patch.listId, "somewhere");
  });

  it("falls back to the first ordinary list when the origin is gone", () => {
    const { patch } = planReopen(completed, { ...base, originStillExists: false, spawned: null });
    assert.equal(patch.listId, "inbox");
  });

  it("removes the spawned occurrence only if nobody has touched it", () => {
    const untouched = task({ id: "t1-next-1", version: 1 });
    const plan = planReopen(completed, { ...base, spawned: untouched });
    assert.equal(plan.deleteSpawnedId, "t1-next-1");
    assert.equal(plan.patch.spawnedNextTaskId, null);
  });

  it("keeps an edited occurrence, and keeps the pointer so it is not spawned twice", () => {
    const edited = task({ id: "t1-next-1", version: 3 });
    const plan = planReopen(completed, { ...base, spawned: edited });
    assert.equal(plan.deleteSpawnedId, null);
    assert.equal("spawnedNextTaskId" in plan.patch, false);
  });

  it("keeps a completed occurrence", () => {
    const done = task({ id: "t1-next-1", completed: true });
    assert.equal(planReopen(completed, { ...base, spawned: done }).deleteSpawnedId, null);
  });

  it("forgets an occurrence the user deleted, so a new one can be made", () => {
    const plan = planReopen(completed, { ...base, spawned: null });
    assert.equal(plan.deleteSpawnedId, null);
    assert.equal(plan.patch.spawnedNextTaskId, null);
  });
});

describe("default lists", () => {
  it("has exactly one Complete list, fifth, identified by kind", () => {
    const completes = DEFAULT_LISTS.filter((l) => l.kind === COMPLETE_KIND);
    assert.equal(completes.length, 1);
    assert.equal(DEFAULT_LISTS.indexOf(completes[0]), 4);
    assert.deepEqual(
      DEFAULT_LISTS.map((l) => l.name),
      ["Inbox", "Todo", "In progress", "Waiting", "Complete", "Someday"],
    );
  });

  it("isCompleteList reads the kind and not the name", () => {
    assert.equal(isCompleteList({ kind: "complete" }), true);
    assert.equal(isCompleteList({ kind: null }), false);
  });
});

const L = (id: string, position: number): TaskList => ({
  id,
  boardId: "b",
  name: id,
  position,
  colorValue: 0,
  isSystem: false,
  kind: null,
});

describe("moving a list", () => {
  const abc = [L("a", 1000), L("b", 2000), L("c", 3000)];

  it("moving right puts the list between its new neighbours", () => {
    const plan = planListMove(abc, "a", 1)!;
    assert.equal(plan.position, 2500);
    assert.deepEqual(plan.reordered.map((l) => l.id), ["b", "a", "c"]);
  });

  it("moving left to the front goes before the first list", () => {
    const plan = planListMove(abc, "b", -1)!;
    assert.ok(plan.position < 1000);
    assert.deepEqual(plan.reordered.map((l) => l.id), ["b", "a", "c"]);
  });

  it("moving right to the end goes after the last list", () => {
    const plan = planListMove(abc, "b", 1)!;
    assert.ok(plan.position > 3000);
    assert.deepEqual(plan.reordered.map((l) => l.id), ["a", "c", "b"]);
  });

  it("cannot move past either end or an unknown list", () => {
    assert.equal(planListMove(abc, "a", -1), null);
    assert.equal(planListMove(abc, "c", 1), null);
    assert.equal(planListMove(abc, "zzz", 1), null);
  });

  it("asks for a rebalance when the neighbours are too close", () => {
    const tight = [L("a", 1), L("b", 1.00001), L("c", 1.00002), L("d", 5)];
    assert.equal(planListMove(tight, "a", 1)!.needsRebalance, true);
  });
});
