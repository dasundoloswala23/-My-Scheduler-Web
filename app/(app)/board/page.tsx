"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Board } from "@/components/board";
import { useBoards } from "@/lib/hooks";

/**
 * The board is addressed as /board?id=… rather than /boards/[id] because the
 * site is exported as static files for Firebase Hosting, and a dynamic segment
 * would need every board id known at build time. Board ids belong to each
 * signed-in user, so they cannot be.
 */
function BoardScreen() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const boards = useBoards();
  const board = boards.find((b) => b.id === id);

  if (!id) {
    return (
      <div className="px-5 py-10 md:px-8">
        <p className="text-sm text-muted">No board selected.</p>
        <Link href="/boards" className="text-sm font-semibold text-primary hover:underline">
          ← Back to boards
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col py-5">
      <div className="px-5 md:px-8">
        <Link href="/boards" className="text-[12px] font-semibold text-muted hover:text-primary">
          ← All boards
        </Link>
        <p className="eyebrow mt-2">{board?.workspace ?? "Personal workspace"}</p>
        <h1 className="text-3xl font-bold">{board?.name ?? "Board"}</h1>
      </div>

      <div className="mt-4 min-h-0 flex-1">
        <Board boardId={id} />
      </div>
    </div>
  );
}

export default function BoardPage() {
  // useSearchParams needs a Suspense boundary when the page is prerendered.
  return (
    <Suspense fallback={<div className="px-5 py-10 text-sm text-muted">Loading board…</div>}>
      <BoardScreen />
    </Suspense>
  );
}
