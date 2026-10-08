"use client";

import { Plus, Rocket, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { FLOW_FILTERS, filterFlows, isBlocked, type FlowFilter } from "@/lib/flow-engine";
import { useFlowResults, useFlows } from "@/lib/flow-hooks";
import { createFlow } from "@/lib/flow-repo";
import {
  FLOW_TEMPLATES,
  templateAdvisor,
  type FlowSuggestion,
  type FlowTemplate,
} from "@/lib/flow-templates";
import { FLOW_MODES, type FlowMode } from "@/lib/flow-types";
import { useBoards, useCategories } from "@/lib/hooks";

export default function FlowsPage() {
  const flows = useFlows();
  const results = useFlowResults();
  const boards = useBoards();
  const categories = useCategories();

  const [filter, setFilter] = useState<FlowFilter>("all");
  const [search, setSearch] = useState("");
  const [boardId, setBoardId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [creating, setCreating] = useState(false);

  const shown = filterFlows({
    flows,
    results,
    filter,
    search,
    boardId: boardId || null,
    categoryId: categoryId || null,
    now: new Date(),
  });

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Plan a project</p>
          <h1 className="text-3xl font-bold">Project Flows</h1>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> New flow
        </button>
      </div>

      {flows.length === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <Rocket className="mx-auto h-10 w-10 text-muted" />
          <p className="mt-3 font-bold">Plan a project in stages</p>
          <p className="mt-1 text-sm text-muted">
            A flow groups the tasks you already have into stages and shows how far along you are.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
              <Search className="h-4 w-4 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search flows"
                aria-label="Search flows"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <select
              value={boardId}
              onChange={(e) => setBoardId(e.target.value)}
              aria-label="Filter by board"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="">All boards</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filter by category"
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Flow filter">
            {FLOW_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
                  filter === f.id
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-line text-muted hover:border-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {shown.length === 0 && <p className="text-sm text-muted">No flows match.</p>}
            {shown.map((flow) => {
              const r = results[flow.id];
              const blocked = r ? isBlocked(r) : false;
              const status = r?.status ?? flow.status;
              const current = r?.stages.find((s) => s.stage.id === r.currentStageId)?.stage.title;
              return (
                <Link
                  key={flow.id}
                  href={`/flow?id=${flow.id}`}
                  className="card p-5 transition hover:border-primary"
                >
                  <div className="flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-primary" />
                    <h2 className="truncate text-base font-bold">{flow.name}</h2>
                    <span
                      className={`ml-auto rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${
                        blocked
                          ? "bg-danger/10 text-danger"
                          : status === "completed"
                            ? "bg-success/10 text-success"
                            : "bg-primary-soft text-primary"
                      }`}
                    >
                      {blocked ? "Blocked" : status[0].toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-divider">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r?.progress ?? 0) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[12.5px] text-muted">
                    {r?.completedStages ?? 0}/{r?.totalStages ?? 0} stages
                    {current ? ` · Now: ${current}` : ""}
                    {flow.dueDate ? ` · Due ${flow.dueDate.toLocaleDateString()}` : ""}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {creating && <CreateFlowDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateFlowDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const boards = useBoards();

  const [template, setTemplate] = useState<FlowTemplate>(FLOW_TEMPLATES[0]);
  const [name, setName] = useState(FLOW_TEMPLATES[0].name);
  const [mode, setMode] = useState<FlowMode>(FLOW_TEMPLATES[0].mode);
  const [boardId, setBoardId] = useState("");
  const [advisorStages, setAdvisorStages] = useState<string[] | null>(null);
  const [goal, setGoal] = useState("");
  const [suggestion, setSuggestion] = useState<FlowSuggestion | null>(null);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const stages = advisorStages ?? template.stages;

  async function create() {
    if (!user || busy || !name.trim()) return;
    setBusy(true);
    try {
      const id = await createFlow(
        user.uid,
        { name, mode, boardId: boardId || null },
        stages,
      );
      router.push(`/flow?id=${id}`);
      onClose();
    } catch {
      setBusy(false);
      toast.error("Could not create the flow. Try again.");
    }
  }

  async function ask() {
    if (!goal.trim()) return;
    setSuggestion(await templateAdvisor.suggest(goal));
    setEditing(null);
  }

  function accept(list: string[]) {
    setAdvisorStages(list);
    if (suggestion?.flowName) setName(suggestion.flowName);
    setSuggestion(null);
    setEditing(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New Project Flow"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <h2 className="text-xl font-bold">New Project Flow</h2>

        <label className="mt-4 block text-[12.5px] font-semibold text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          />
        </label>

        <label className="mt-3 block text-[12.5px] font-semibold text-muted">
          Board (optional)
          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">No board</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-4 text-[12.5px] font-semibold text-muted">Start from</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FLOW_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTemplate(t);
                setMode(t.mode);
                setAdvisorStages(null);
                setName(t.name);
              }}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                template.id === t.id && !advisorStages
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line text-muted"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="text-[13px] font-semibold">Suggest stages from a goal</p>
          <div className="mt-2 flex gap-2">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="I want to launch my Flutter app"
              aria-label="Goal"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button type="button" onClick={ask} className="rounded-lg border border-line px-3 text-sm font-semibold">
              Suggest
            </button>
          </div>

          {suggestion && (
            <div className="mt-3 text-sm">
              <p className="text-[12px] text-muted">{suggestion.source}</p>
              {suggestion.stages.length === 0 ? (
                <p className="mt-2">
                  Nothing in the built-in templates matches that. Pick a template or start from Custom.
                </p>
              ) : editing ? (
                <div className="mt-2 space-y-1.5">
                  {editing.map((t, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={t}
                        onChange={(e) => setEditing(editing.map((x, j) => (j === i ? e.target.value : x)))}
                        aria-label={`Stage ${i + 1}`}
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        aria-label="Remove stage"
                        onClick={() => setEditing(editing.filter((_, j) => j !== i))}
                        className="px-2 text-muted"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <ol className="mt-2 list-decimal pl-5">
                  {suggestion.stages.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              )}
              <p className="mt-2 text-[12px] text-muted">
                Accepting creates these stages only. No tasks are created.
              </p>
              <div className="mt-2 flex gap-2">
                {suggestion.stages.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        accept(editing ? editing.map((s) => s.trim()).filter(Boolean) : suggestion.stages)
                      }
                      className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-white"
                    >
                      {editing ? "Use these" : "Add all"}
                    </button>
                    {!editing && (
                      <button
                        type="button"
                        onClick={() => setEditing([...suggestion.stages])}
                        className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold"
                      >
                        Customize
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSuggestion(null);
                    setEditing(null);
                  }}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-[12.5px] text-muted">
          {stages.length === 0
            ? "No stages yet. You can add your own on the next screen."
            : `${stages.length} stages: ${stages.join(" › ")}`}
        </p>
        <p className="text-[12px] text-disabled">This creates stages only. No tasks are created.</p>

        <p className="mt-4 text-[12.5px] font-semibold text-muted">How stages unlock</p>
        <div className="mt-2 flex gap-2">
          {FLOW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${
                mode === m.id ? "border-primary bg-primary-soft text-primary" : "border-line text-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-muted">{FLOW_MODES.find((m) => m.id === mode)?.description}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Create flow
          </button>
        </div>
      </div>
    </div>
  );
}
