"use client";

import { format } from "date-fns";
import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useNotes } from "@/lib/hooks";
import { addNote, deleteNote, saveNote } from "@/lib/repo";

export default function NotesPage() {
  const { user } = useAuth();
  const notes = useNotes();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function create() {
    if (!user) return;
    const title = window.prompt("Note title");
    if (!title?.trim()) return;
    await addNote(user.uid, { title: title.trim(), body: "", categoryId: null });
  }

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">My scheduler</p>
          <h1 className="text-3xl font-bold">Notes</h1>
        </div>
        <button
          type="button"
          onClick={create}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add note
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="card mt-10 flex flex-col items-center gap-4 px-6 py-16 text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-primary-soft">
            <NotebookPen className="h-8 w-8 text-primary" />
          </span>
          <h2 className="text-xl font-bold">Your notes live here</h2>
          <p className="max-w-sm text-[13px] text-muted">
            This focused space is ready for your content, preferences, and workflow.
          </p>
          <button
            type="button"
            onClick={create}
            className="rounded-xl bg-primary-soft px-5 py-3 text-sm font-semibold text-primary"
          >
            + Add Note
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <div key={note.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold">{note.title}</h3>
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={() => user && deleteNote(user.uid, note.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted hover:text-danger" />
                </button>
              </div>
              {editing === note.id ? (
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={async () => {
                    if (user) await saveNote(user.uid, note.id, { body: draft });
                    setEditing(null);
                  }}
                  rows={6}
                  className="mt-2 w-full rounded-lg border border-line bg-background p-2 text-[13px] outline-none focus:border-primary"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(note.id);
                    setDraft(note.body);
                  }}
                  className="mt-2 block w-full text-left text-[13px] text-muted"
                >
                  {note.body || "Click to write…"}
                </button>
              )}
              {note.updatedAt && (
                <p className="mt-3 text-[11px] text-muted">
                  Updated {format(note.updatedAt, "MMM d, h:mm a")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
