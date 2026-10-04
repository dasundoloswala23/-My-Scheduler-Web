"use client";

import { LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/lib/auth-context";
import { useBoards, useLists, useTasks } from "@/lib/hooks";
import { addBoard, addList, appendPosition } from "@/lib/repo";
import { argbToCss } from "@/lib/types";

export default function BoardsPage() {
  const { user } = useAuth();
  const boards = useBoards();
  const lists = useLists();
  const tasks = useTasks();

  async function createBoard() {
    if (!user) return;
    const name = window.prompt("Board name");
    if (!name?.trim()) return;

    const boardId = await addBoard(user.uid, {
      name: name.trim(),
      colorValue: 0xff6c5ce7,
      position: appendPosition(boards),
      workspace: "Personal workspace",
    });
    // A new board starts with the same default columns as the first one.
    const names = ["Inbox", "Todo", "In progress", "Waiting", "Done"];
    await Promise.all(
      names.map((listName, i) =>
        addList(user.uid, {
          boardId,
          name: listName,
          position: (i + 1) * 1000,
          colorValue: 0xff9ca3af,
          isSystem: true,
        }),
      ),
    );
  }

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">{boards.length} workspaces</p>
          <h1 className="text-3xl font-bold">Boards</h1>
        </div>
        <button
          type="button"
          onClick={createBoard}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Create board
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <Link
            key={board.id}
            href={`/boards/${board.id}`}
            className="card p-5 transition hover:border-primary"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${argbToCss(board.colorValue)} 14%, transparent)` }}
            >
              <LayoutGrid className="h-6 w-6" style={{ color: argbToCss(board.colorValue) }} />
            </span>
            <p className="eyebrow mt-4">{board.workspace}</p>
            <h2 className="text-lg font-bold">{board.name}</h2>
            <p className="mt-1 text-[12.5px] text-muted">
              {tasks.filter((t) => t.boardId === board.id).length} tasks ·{" "}
              {lists.filter((l) => l.boardId === board.id).length} lists
            </p>
          </Link>
        ))}

        <button
          type="button"
          onClick={createBoard}
          className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-muted transition hover:border-primary hover:text-primary"
        >
          <Plus className="h-6 w-6" />
          Create board
        </button>
      </div>
    </div>
  );
}
