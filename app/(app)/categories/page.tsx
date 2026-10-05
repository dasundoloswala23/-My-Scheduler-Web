"use client";

import { Pencil, Plus, Tag, Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useCategories, useTasks } from "@/lib/hooks";
import { addCategory, appendPosition, deleteCategory, renameCategory } from "@/lib/repo";
import { argbToCss } from "@/lib/types";

const PALETTE = [0xff6c5ce7, 0xff3b82f6, 0xff30a46c, 0xffe8a33d, 0xffe5484d, 0xffec4899, 0xff14b8a6, 0xff6b7280];

export default function CategoriesPage() {
  const { user } = useAuth();
  const categories = useCategories();
  const tasks = useTasks();

  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    if (!t.completed && t.categoryId) acc[t.categoryId] = (acc[t.categoryId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="px-5 py-5 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Areas of life</p>
          <h1 className="text-3xl font-bold">Categories</h1>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!user) return;
            const name = window.prompt("Category name");
            if (!name?.trim()) return;
            await addCategory(user.uid, {
              name: name.trim(),
              colorValue: PALETTE[categories.length % PALETTE.length],
              position: appendPosition(categories),
              iconCode: 0,
            });
          }}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Add category
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="card flex items-center gap-3 px-4 py-3.5">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${argbToCss(c.colorValue)} 14%, transparent)` }}
            >
              <Tag className="h-5 w-5" style={{ color: argbToCss(c.colorValue) }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: argbToCss(c.colorValue) }}>
                {c.name}
              </p>
              <p className="text-[12px] text-muted">{counts[c.id] ?? 0} active tasks</p>
            </div>
            <button
              type="button"
              aria-label={`Rename ${c.name}`}
              onClick={async () => {
                if (!user) return;
                const name = window.prompt("Category name", c.name);
                if (!name?.trim() || name.trim() === c.name) return;
                await renameCategory(user.uid, c.id, name.trim());
              }}
            >
              <Pencil className="h-4 w-4 text-muted hover:text-primary" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${c.name}`}
              onClick={() => user && window.confirm(`Delete ${c.name}?`) && deleteCategory(user.uid, c.id)}
            >
              <Trash2 className="h-4 w-4 text-muted hover:text-danger" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
