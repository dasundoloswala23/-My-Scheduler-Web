"use client";

import { Bell, CalendarDays, CheckCircle2, NotebookPen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useBoards, useCategories, useLists, useTasks, tasksForList } from "@/lib/hooks";
import { usePreferences } from "@/lib/preferences";
import { addNote, appendPosition, createTask, paths } from "@/lib/repo";
import { addDoc, serverTimestamp, Timestamp } from "firebase/firestore";

type Kind = "task" | "note" | "reminder" | "event";

const KINDS: { kind: Kind; label: string; icon: typeof CheckCircle2 }[] = [
  { kind: "task", label: "Task", icon: CheckCircle2 },
  { kind: "note", label: "Note", icon: NotebookPen },
  { kind: "reminder", label: "Reminder", icon: Bell },
  { kind: "event", label: "Event", icon: CalendarDays },
];

export function QuickAddDialog({
  open,
  onClose,
  defaultListId,
  defaultBoardId,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultListId?: string;
  defaultBoardId?: string;
  defaultDate?: Date;
}) {
  const { user } = useAuth();
  const categories = useCategories();
  const boards = useBoards();
  const lists = useLists();
  const tasks = useTasks();

  // The dialog is mounted only while open, so these initial values are fresh
  // every time it is opened.
  const { preferences } = usePreferences();

  const [kind, setKind] = useState<Kind>("task");
  const [title, setTitle] = useState("");
  // Starts from the user's default category when they have set one. The dialog
  // is mounted only while open, so this is read fresh each time.
  const [categoryId, setCategoryId] = useState(preferences.defaultCategoryId ?? "");
  const [boardId, setBoardId] = useState(defaultBoardId ?? "");
  const [listId, setListId] = useState(defaultListId ?? "");
  const [date, setDate] = useState(() => toDateInput(defaultDate ?? new Date()));
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const boardLists = lists.filter((l) => l.boardId === boardId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim()) return;
    setBusy(true);

    const when = time ? new Date(`${date}T${time}`) : null;
    try {
      if (kind === "task" || kind === "event") {
        const targetBoard = boardId || boards[0]?.id || null;
        const targetList =
          listId || lists.find((l) => l.boardId === targetBoard)?.id || null;
        const siblings = targetList ? tasksForList(tasks, targetList) : [];
        await createTask(user.uid, {
          title: title.trim(),
          listId: targetList,
          boardId: targetBoard,
          categoryId: categoryId || null,
          priority: preferences.defaultPriority,
          position: appendPosition(siblings),
          startDateTime: when,
          endDateTime: when ? new Date(+when + 60 * 60 * 1000) : null,
        });
      } else if (kind === "note") {
        await addNote(user.uid, { title: title.trim(), body: "", categoryId: categoryId || null });
      } else {
        const remindAt = when ?? new Date(`${date}T09:00`);
        await addDoc(paths.reminders(user.uid), {
          title: title.trim(),
          remindAt: Timestamp.fromDate(remindAt),
          done: false,
          notificationId: Math.floor(+remindAt / 1000),
          updatedAt: serverTimestamp(),
        });
      }
      toast.success(`${capitalise(kind)} added`);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-[560px] rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow">Quick capture</p>
            <h2 className="text-2xl font-bold">Create something</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2.5">
          {KINDS.map(({ kind: k, label, icon: Icon }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition ${
                kind === k
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line text-muted hover:border-primary/40"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        <label className="eyebrow mt-5 block">What do you need to do?</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`New ${kind} title`}
          className="mt-2 w-full rounded-xl border border-line bg-background px-4 py-3 text-sm outline-none focus:border-primary"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            >
              <option value="">Inbox</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          {(kind === "task" || kind === "event") && (
            <Field label="Board">
              <select
                value={boardId}
                onChange={(e) => {
                  setBoardId(e.target.value);
                  setListId("");
                }}
                className="w-full bg-transparent text-sm outline-none"
              >
                <option value="">No board</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {(kind === "task" || kind === "event") && boardLists.length > 0 && (
            <Field label="List">
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              >
                <option value="">First list</option>
                {boardLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </Field>

          <Field label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Add {capitalise(kind)}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="rounded-xl border border-line px-3.5 py-2.5">
      <span className="eyebrow block">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function capitalise(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}
