"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  CloudOff,
  Grid2x2,
  Home,
  Inbox,
  LayoutGrid,
  type LucideIcon,
  MoreHorizontal,
  Notebook,
  PartyPopper,
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
import { useBoards, useDataStatus } from "@/lib/hooks";
import { argbToCss } from "@/lib/types";

import { QuickAddDialog } from "./quick-add-dialog";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/boards", label: "Boards", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/search", label: "Search", icon: Search },
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/notes", label: "Notes", icon: Notebook },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/holidays", label: "Holidays", icon: PartyPopper },
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
          <span className="text-base font-bold">MyPlanScheduler</span>
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
          <Link
            href="/search"
            className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-line px-3.5 text-left text-[13.5px] text-muted transition hover:border-primary"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 truncate">Search tasks, boards, notes…</span>
            <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] sm:block">
              ⌘K
            </kbd>
          </Link>
          <button
            type="button"
            onClick={() => setQuickAdd(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-background transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Quick add</span>
          </button>
        </header>

        <OfflineBanner />
        <DataErrorBanner />
        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>

        <MobileNav pathname={pathname} />
      </div>

      {/* Mounted only while open, so its fields start fresh each time. */}
      {quickAdd && <QuickAddDialog open onClose={() => setQuickAdd(false)} />}
    </div>
  );
}

/**
 * Shows when the browser has lost its connection. Firestore keeps serving from
 * its IndexedDB cache and queues writes, so the app keeps working; this just
 * makes that visible rather than leaving the user guessing.
 */
function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="flex items-center gap-2 bg-amber/15 px-4 py-2 text-[12px] font-semibold text-amber md:px-6">
      <CloudOff className="h-4 w-4 shrink-0" />
      Offline. Your changes are saved here and will sync when you reconnect.
    </div>
  );
}

/** What a listener error means, in words rather than an error code. */
function describeDataError(code: string): string {
  if (code === "permission-denied") {
    return "You do not have access to this data. Try signing out and back in.";
  }
  if (code === "unavailable") {
    return "Could not reach the server, and there is nothing saved on this device yet.";
  }
  return "Something went wrong loading your workspace.";
}

/**
 * Shown when a Firestore listener fails. Without it a failed load looks exactly
 * like an empty account, which is the worst possible thing to show someone.
 */
function DataErrorBanner() {
  const error = useDataStatus((s) => s.error);
  if (!error) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 bg-danger/10 px-4 py-2 text-[12.5px] font-semibold text-danger md:px-6"
    >
      <span className="min-w-0 flex-1">{describeDataError(error.code)}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg border border-danger px-3 py-1 text-[12px]"
      >
        Retry
      </button>
    </div>
  );
}

const MOBILE_TABS = ["/today", "/boards", "/calendar", "/inbox"];

/**
 * Phone navigation: Today, Boards, Calendar, Inbox and More, as on the mobile
 * apps. Everything else — Settings, Holidays, Reminders — lives under More, so
 * no page is unreachable on a small screen.
 */
function MobileNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = NAV.filter((n) => MOBILE_TABS.includes(n.href)).sort(
    (a, b) => MOBILE_TABS.indexOf(a.href) - MOBILE_TABS.indexOf(b.href),
  );
  const rest = NAV.filter((n) => !MOBILE_TABS.includes(n.href));
  const onMore = rest.some((n) =>
    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href),
  );

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          >
            <div className="grid grid-cols-3 gap-1">
              {rest.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-semibold text-muted hover:bg-[var(--hover)]"
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="relative z-50 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${
                active ? "text-primary" : "text-muted"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${
            onMore || moreOpen ? "text-primary" : "text-muted"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
