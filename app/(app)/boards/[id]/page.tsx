"use client";

import Link from "next/link";
import { use } from "react";

import { Board } from "@/components/board";
import { useBoards } from "@/lib/hooks";

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const boards = useBoards();
  const board = boards.find((b) => b.id === id);

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
