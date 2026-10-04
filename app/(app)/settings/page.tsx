"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";

type Theme = "light" | "dark" | "system";

export default function SettingsPage() {
  const { user, resetPassword, signOut } = useAuth();
  const [theme, setTheme] = useState<Theme>("system");

  // Remember the choice per browser; this is a per-viewer convenience only.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as Theme | null;
      if (saved) applyTheme(saved, setTheme);
    } catch {
      /* private mode or blocked storage */
    }
  }, []);

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">My scheduler</p>
      <h1 className="text-3xl font-bold">Settings</h1>

      <section className="card mt-6 divide-y divide-line">
        <Row label="Account" value={user?.email ?? "Signed in"} />
        <Row label="Display name" value={user?.displayName ?? "Not set"} />
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Reset password</p>
            <p className="text-[12.5px] text-muted">Sends a reset link to your email</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!user?.email) return;
              await resetPassword(user.email);
              toast.success(`Reset email sent to ${user.email}`);
            }}
            className="rounded-xl border border-line px-4 py-2 text-[13px] font-semibold"
          >
            Send link
          </button>
        </div>
      </section>

      <section className="card mt-4 p-5">
        <p className="text-sm font-semibold">Appearance</p>
        <div className="mt-3 flex gap-2">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => applyTheme(t, setTheme)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold capitalize ${
                theme === t ? "border-primary bg-primary-soft text-primary" : "border-line"
              }`}
            >
              {t === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {t}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={signOut}
        className="card mt-4 flex w-full items-center gap-3 px-5 py-4 text-sm font-semibold text-danger"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>

      <p className="mt-6 text-center text-xs text-muted">My scheduler · v1.0.0</p>
    </div>
  );
}

function applyTheme(theme: Theme, setTheme: (t: Theme) => void) {
  setTheme(theme);
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[13px] text-muted">{value}</p>
    </div>
  );
}
