"use client";

import {
  BarChart3,
  CalendarDays,
  Grid2x2,
  Home,
  Inbox,
  LayoutGrid,
  type LucideIcon,
  Notebook,
  Plus,
  Search,
  Settings,
  Sun,
  Tag,
  Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";
import { useBoards } from "@/lib/hooks";
import { argbToCss } from "@/lib/types";

import { QuickAddDialog } from "./quick-add-dialog";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/boards", label: "Boards", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/notes", label: "Notes", icon: Notebook },
  { href: "/focus", label: "Focus", icon: Target },
  { href: "/eisenhower", label: "Eisenhower", icon: Grid2x2 },
  { href: "/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const boards = useBoards();
  const [quickAdd, setQuickAdd] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Cmd/Ctrl+K opens quick add, like the search hint in the design.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickAdd(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Loading your workspace…
      </div>
    );
  }

  const initials = (user.displayName ?? user.email ?? "U")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <BarChart3 className="h-4 w-4 text-white" />
          </span>
          <span className="text-base font-bold">My scheduler</span>
        </div>

        <div className="mx-3 mb-3 rounded-xl border border-line px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-background">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold">
                {user.displayName ?? "My workspace"}
              </p>
              <p className="truncate text-[11px] text-muted">{user.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-primary-soft text-primary" : "text-ink/80 hover:bg-primary-soft/50"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? "text-primary" : "text-muted"}`} />
                {label}
              </Link>
            );
          })}

          <p className="eyebrow mt-5 px-3 pb-2">Your boards</p>
          {boards.map((b) => (
            <Link
              key={b.id}
              href={`/board?id=${b.id}`}
              className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold text-ink/80 hover:bg-primary-soft/50"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: argbToCss(b.colorValue) }}
              />
              <span className="truncate">{b.name}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line bg-surface px-4 py-3 md:px-6">
          <button
            type="button"
            onClick={() => setQuickAdd(true)}
            className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-line px-3.5 text-left text-[13.5px] text-muted transition hover:border-primary"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 truncate">Search tasks, boards, notes…</span>
            <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] sm:block">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setQuickAdd(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-background transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Quick add</span>
          </button>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>

        {/* Mobile navigation, matching the phone screens. */}
        <nav className="flex border-t border-line bg-surface md:hidden">
          {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Mounted only while open, so its fields start fresh each time. */}
      {quickAdd && <QuickAddDialog open onClose={() => setQuickAdd(false)} />}
    </div>
  );
}
