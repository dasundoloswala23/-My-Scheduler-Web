import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateFlow,
  filterFlows,
  findCycle,
  wouldCreateCycle,
  type FlowResult,
  type TaskCounts,
} from "./flow-engine.ts";
import { FLOW_TEMPLATES, flowTemplateById, templateAdvisor } from "./flow-templates.ts";
import type {
  FlowMode,
  FlowStage,
  FlowStatus,
  ManualStageStatus,
  ProjectFlow,
} from "./flow-types.ts";

/** The same vectors as the Flutter app's test/flow_engine_test.dart. */

function stage(
  id: string,
  position: number,
  o: { required?: boolean; deps?: string[]; manual?: ManualStageStatus; auto?: boolean } = {},
): FlowStage {
  return {
    id,
    flowId: "f",
    title: id,
    description: "",
    position,
    startDate: null,
    dueDate: null,
    priority: "medium",
    colorValue: null,
    isRequired: o.required ?? true,
    dependencyStageIds: o.deps ?? [],
    autoCompleteWhenTasksDone: o.auto ?? true,
    manualStatus: o.manual ?? null,
    state: "locked",
    completedAt: null,
  };
}

const run = (
  mode: FlowMode,
  stages: FlowStage[],
  counts: Record<string, TaskCounts> = {},
  status: FlowStatus = "active",
) => evaluateFlow({ mode, status }, stages, counts);

const states = (r: FlowResult) => Object.fromEntries(r.stages.map((s) => [s.stage.id, s.state]));

const done: TaskCounts = { done: 2, total: 2 };
const half: TaskCounts = { done: 1, total: 2 };

describe("sequential", () => {
  const stages = [stage("a", 1), stage("b", 2), stage("c", 3), stage("d", 4)];

  it("only the first stage is active; the next is up next; the rest are locked", () => {
    const r = run("sequential", stages);
    assert.deepEqual(states(r), { a: "active", b: "upcoming", c: "locked", d: "locked" });
    assert.equal(r.currentStageId, "a");
  });

  it("finishing stage 1 unlocks stage 2", () => {
    const r = run("sequential", stages, { a: done });
    assert.equal(states(r).a, "completed");
    assert.equal(states(r).b, "active");
    assert.equal(states(r).c, "upcoming");
    assert.equal(r.currentStageId, "b");
  });

  it("a half-finished stage does not unlock the next", () => {
    const r = run("sequential", stages, { a: half });
    assert.equal(states(r).a, "active");
    assert.equal(states(r).b, "upcoming");
  });

  it("order follows position, not the order stored", () => {
    const r = run("sequential", [stage("c", 3), stage("a", 1), stage("b", 2)]);
    assert.deepEqual(r.stages.map((s) => s.stage.id), ["a", "b", "c"]);
    assert.equal(states(r).a, "active");
  });

  it("an optional unfinished stage does not hold up the next", () => {
    const r = run("sequential", [stage("a", 1), stage("opt", 2, { required: false }), stage("c", 3)], {
      a: done,
    });
    assert.equal(states(r).c, "active");
  });

  it("a blocked stage shows the stages behind it as blocked, not just locked", () => {
    const r = run("sequential", [stage("a", 1, { manual: "blocked" }), stage("b", 2)]);
    assert.deepEqual(states(r), { a: "blocked", b: "blocked" });
  });
});

describe("flexible", () => {
  it("every unfinished stage is active at once", () => {
    const r = run("flexible", [stage("a", 1), stage("b", 2), stage("c", 3)], { b: done });
    assert.deepEqual(states(r), { a: "active", b: "completed", c: "active" });
  });

  it("currentStageId is the first active stage by position", () => {
    assert.equal(run("flexible", [stage("a", 1), stage("b", 2)], { a: done }).currentStageId, "b");
  });
});

describe("dependency", () => {
  it("a stage unlocks only when everything it depends on is complete", () => {
    const stages = [stage("design", 1), stage("build", 2), stage("test", 3, { deps: ["design", "build"] })];
    let r = run("dependency", stages, { design: done });
    assert.equal(states(r).test, "upcoming");
    assert.equal(states(r).build, "active");
    r = run("dependency", stages, { design: done, build: done });
    assert.equal(states(r).test, "active");
  });

  it("a stage waiting on something locked is locked", () => {
    const r = run("dependency", [stage("a", 1), stage("b", 2, { deps: ["a"] }), stage("c", 3, { deps: ["b"] })]);
    assert.deepEqual(states(r), { a: "active", b: "upcoming", c: "locked" });
  });

  it("a dependency on a stage that no longer exists is ignored", () => {
    assert.equal(states(run("dependency", [stage("a", 1, { deps: ["gone"] })])).a, "active");
  });

  it("a cycle is detected and its stages are blocked, not silently ignored", () => {
    const r = run("dependency", [stage("a", 1, { deps: ["b"] }), stage("b", 2, { deps: ["a"] }), stage("c", 3)]);
    assert.equal(r.hasCycle, true);
    assert.deepEqual([...r.cycleStageIds].sort(), ["a", "b"]);
    assert.equal(states(r).a, "blocked");
    assert.equal(states(r).b, "blocked");
    assert.equal(states(r).c, "active");
  });

  it("a stage that depends on itself is a cycle", () => {
    assert.deepEqual([...findCycle([stage("a", 1, { deps: ["a"] })])], ["a"]);
  });

  it("wouldCreateCycle says so before the edit that would make one", () => {
    const stages = [stage("a", 1), stage("b", 2, { deps: ["a"] }), stage("c", 3, { deps: ["b"] })];
    assert.equal(wouldCreateCycle(stages, "a", "c"), true);
    assert.equal(wouldCreateCycle(stages, "c", "a"), false);
    assert.equal(wouldCreateCycle(stages, "b", "b"), true);
  });

  it("a blocked prerequisite blocks what depends on it", () => {
    const r = run("dependency", [stage("a", 1, { manual: "blocked" }), stage("b", 2, { deps: ["a"] })]);
    assert.equal(states(r).b, "blocked");
  });
});

describe("completion of a stage", () => {
  it("finishing every linked task completes the stage", () => {
    assert.equal(states(run("flexible", [stage("a", 1)], { a: done })).a, "completed");
  });

  it("a stage with no tasks is not complete by itself", () => {
    assert.equal(states(run("flexible", [stage("a", 1)])).a, "active");
  });

  it("with auto-complete off, finished tasks leave the stage for the user to close", () => {
    assert.equal(states(run("flexible", [stage("a", 1, { auto: false })], { a: done })).a, "active");
  });

  it("marking a stage complete by hand completes it without tasks", () => {
    assert.equal(states(run("flexible", [stage("a", 1, { manual: "completed" })])).a, "completed");
  });

  it("reopening one task of a finished stage reopens the stage", () => {
    const stages = [stage("a", 1), stage("b", 2)];
    assert.equal(states(run("sequential", stages, { a: done })).b, "active");
    const r = run("sequential", stages, { a: half });
    assert.equal(states(r).a, "active");
    assert.equal(states(r).b, "upcoming");
  });
});

describe("progress and flow status", () => {
  it("progress is completed stages over all stages", () => {
    const stages = Array.from({ length: 9 }, (_, i) => stage(`s${i}`, i));
    const counts = Object.fromEntries([0, 1, 2, 3].map((i) => [`s${i}`, done]));
    const r = run("sequential", stages, counts);
    assert.equal(r.completedStages, 4);
    assert.equal(r.totalStages, 9);
    assert.ok(Math.abs(r.progress - 4 / 9) < 1e-9);
  });

  it("an empty flow has no progress and is not complete", () => {
    const r = run("sequential", []);
    assert.equal(r.progress, 0);
    assert.equal(r.status, "active");
  });

  it("the flow completes when every required stage is complete", () => {
    const r = run("sequential", [stage("a", 1), stage("opt", 2, { required: false })], { a: done });
    assert.equal(r.status, "completed");
  });

  it("an unfinished required stage keeps the flow active", () => {
    assert.equal(run("flexible", [stage("a", 1), stage("b", 2)], { a: done }).status, "active");
  });

  it("paused and archived are the user's choice and are kept", () => {
    assert.equal(run("flexible", [stage("a", 1)], { a: done }, "paused").status, "paused");
    assert.equal(run("flexible", [stage("a", 1)], {}, "archived").status, "archived");
  });
});

describe("filtering flows", () => {
  const now = new Date(2026, 9, 8, 12);
  const flow = (id: string, name: string, o: Partial<ProjectFlow> = {}): ProjectFlow => ({
    id,
    name,
    description: "",
    icon: "",
    colorValue: 0,
    boardId: null,
    categoryId: null,
    mode: "sequential",
    status: "active",
    currentStageId: null,
    progress: 0,
    startDate: null,
    dueDate: null,
    createdAt: null,
    completedAt: null,
    ...o,
  });
  const a = flow("a", "Launch app", { dueDate: new Date(2026, 9, 10), boardId: "b1", categoryId: "c1" });
  const b = flow("b", "Website", { boardId: "b2" });
  const c = flow("c", "Old project");
  const d = flow("d", "Shelved", { status: "archived" });
  const r = (f: ProjectFlow, st: FlowStage) => evaluateFlow(f, [st]);
  const results = {
    a: r(a, stage("a1", 1)),
    b: r(b, stage("b1", 1, { manual: "blocked" })),
    c: r(c, stage("c1", 1, { manual: "completed" })),
    d: r(d, stage("d1", 1)),
  };
  const ids = (filter: Parameters<typeof filterFlows>[0]["filter"], extra = {}) =>
    filterFlows({ flows: [a, b, c, d], results, filter, now, ...extra }).map((f) => f.id);

  it("All includes everything, archived too", () => assert.deepEqual(ids("all"), ["a", "b", "c", "d"]));
  it("Active leaves out finished and archived", () => assert.deepEqual(ids("active"), ["a", "b"]));
  it("Completed", () => assert.deepEqual(ids("completed"), ["c"]));
  it("Blocked finds the flow with a blocked stage", () => assert.deepEqual(ids("blocked"), ["b"]));
  it("Due soon finds a flow due within a week", () => assert.deepEqual(ids("dueSoon"), ["a"]));
  it("search is case-insensitive", () => assert.deepEqual(ids("all", { search: "WEB" }), ["b"]));
  it("board and category filters", () => {
    assert.deepEqual(ids("all", { boardId: "b1" }), ["a"]);
    assert.deepEqual(ids("all", { categoryId: "c1" }), ["a"]);
    assert.deepEqual(ids("active", { search: "launch", boardId: "b2" }), []);
  });
});

describe("templates and the advisor", () => {
  it("Mobile App Launch has the nine agreed stages", () => {
    assert.deepEqual(flowTemplateById("mobile_app_launch")!.stages, [
      "Planning",
      "Development",
      "Internal QA",
      "Beta Testing",
      "Store Preparation",
      "Google Play",
      "App Store",
      "Marketing",
      "Post Launch",
    ]);
  });

  it("every template has stages except Custom, and the six names are present", () => {
    for (const t of FLOW_TEMPLATES) {
      if (t.id === "custom") assert.equal(t.stages.length, 0);
      else assert.ok(t.stages.length > 0, t.name);
    }
    assert.deepEqual(
      FLOW_TEMPLATES.map((t) => t.name),
      ["Mobile App Launch", "Website Launch", "Client Project", "Product Launch", "YouTube Channel Launch", "Custom"],
    );
  });

  it('"launch my Flutter app" suggests the mobile stages, labelled as not AI', async () => {
    const s = await templateAdvisor.suggest("I want to launch my Flutter app");
    assert.equal(s.stages[0], "Planning");
    assert.ok(s.stages.includes("Google Play"));
    assert.ok(s.source.toLowerCase().includes("not ai"));
  });

  it("a goal that matches nothing suggests nothing instead of inventing stages", async () => {
    assert.equal((await templateAdvisor.suggest("xyzzy")).stages.length, 0);
  });
});
