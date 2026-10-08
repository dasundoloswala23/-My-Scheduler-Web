"use client";

import { LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { deleteAccount, reauthMethod } from "@/lib/account";
import { useAuth } from "@/lib/auth-context";
import { describeStatus, useBrowserNotifications } from "@/lib/browser-notifications";
import { HOLIDAY_COUNTRIES } from "@/lib/holidays";
import { useCategories } from "@/lib/hooks";
import { usePreferences, type AppPreferences } from "@/lib/preferences";
import type { Priority } from "@/lib/types";

const APP_VERSION = "1.1.0";

export default function SettingsPage() {
  const { user, resetPassword, signOut } = useAuth();
  const categories = useCategories();
  const { preferences, save, loading } = usePreferences();
  const browser = useBrowserNotifications();

  const countryNames = preferences.holidayCountries
    .map((c) => HOLIDAY_COUNTRIES.find((h) => h.code === c)?.name ?? c)
    .join(", ");

  return (
    <div className="px-5 py-5 md:px-8">
      <p className="eyebrow">MyPlanScheduler</p>
      <h1 className="text-3xl font-bold">Settings</h1>

      <div className="mt-6 max-w-2xl space-y-6">
        <Section title="Account">
          <Row label="Email" value={user?.email ?? "Signed in"} />
          <Row label="Display name" value={user?.displayName ?? "Not set"} />
          <div className="flex items-center justify-between gap-3 px-5 py-4">
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
              className="shrink-0 rounded-xl border border-line px-4 py-2 text-[13px] font-semibold"
            >
              Send link
            </button>
          </div>
        </Section>

        {loading ? (
          <p className="text-sm text-muted">Loading your preferences…</p>
        ) : (
          <>
            <Section title="Appearance">
              <Choice
                label="Theme"
                hint="Follows your account, so it matches on your phone and desktop"
                value={preferences.themeMode}
                options={[
                  ["system", "System"],
                  ["light", "Light"],
                  ["dark", "Dark"],
                ]}
                onChange={(v) => save({ themeMode: v as AppPreferences["themeMode"] })}
              />
            </Section>

            <Section title="Calendar">
              <Choice
                label="Default view"
                value={preferences.calendarDefaultView}
                options={[
                  ["day", "Day"],
                  ["threeDay", "3 Days"],
                  ["week", "Week"],
                  ["month", "Month"],
                  ["agenda", "Agenda"],
                ]}
                onChange={(v) =>
                  save({ calendarDefaultView: v as AppPreferences["calendarDefaultView"] })
                }
              />
              <Choice
                label="Opens at"
                hint="Where the day and week grids start. Earlier hours are still there if you scroll up."
                value={String(preferences.calendarScrollHour)}
                options={[0, 6, 7, 8, 9, 10, 12].map((h) => [
                  String(h),
                  formatHour(h),
                ])}
                onChange={(v) => save({ calendarScrollHour: Number(v) })}
              />
              <Choice
                label="Layout"
                value={preferences.calendarDensity}
                options={[
                  ["compact", "Compact"],
                  ["comfortable", "Comfortable"],
                  ["detailed", "Detailed"],
                ]}
                onChange={(v) =>
                  save({ calendarDensity: v as AppPreferences["calendarDensity"] })
                }
              />
              <Choice
                label="Week starts on"
                value={preferences.weekStartsOnMonday ? "monday" : "sunday"}
                options={[
                  ["monday", "Monday"],
                  ["sunday", "Sunday"],
                ]}
                onChange={(v) => save({ weekStartsOnMonday: v === "monday" })}
              />
              <Toggle
                label="Show weekends"
                checked={preferences.showWeekends}
                onChange={(v) => save({ showWeekends: v })}
              />
            </Section>

            <Section title="Tasks">
              <Toggle
                label="Show subtasks on cards"
                hint={
                  preferences.showSubtasksOnCards
                    ? "Cards show the checklist itself"
                    : "Cards show only the completed count"
                }
                checked={preferences.showSubtasksOnCards}
                onChange={(v) => save({ showSubtasksOnCards: v })}
              />
              <Choice
                label="Default priority"
                value={preferences.defaultPriority}
                options={[
                  ["none", "None"],
                  ["low", "Low"],
                  ["medium", "Medium"],
                  ["high", "High"],
                ]}
                onChange={(v) => save({ defaultPriority: v as Priority })}
              />
              <Choice
                label="Default category"
                value={
                  categories.some((c) => c.id === preferences.defaultCategoryId)
                    ? preferences.defaultCategoryId!
                    : ""
                }
                options={[
                  ["", "None"],
                  ...categories.map((c) => [c.id, c.name] as [string, string]),
                ]}
                onChange={(v) => save({ defaultCategoryId: v === "" ? null : v })}
              />
            </Section>

            <Section title="Notifications">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Browser notifications</p>
                    <p className="text-[12.5px] text-muted">
                      {describeStatus(browser.status, browser.enabled)}
                    </p>
                  </div>
                  {browser.status === "default" && (
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await browser.request();
                        if (result === "denied") {
                          toast.error("Notifications were blocked for this site.");
                        }
                      }}
                      className="shrink-0 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white"
                    >
                      Enable
                    </button>
                  )}
                  {browser.status === "granted" && (
                    <input
                      type="checkbox"
                      aria-label="Browser notifications"
                      checked={browser.enabled}
                      onChange={(e) => browser.setEnabled(e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-[var(--primary)]"
                    />
                  )}
                </div>
                <p className="mt-3 text-[12px] text-muted">
                  These only appear while a MyPlanScheduler tab is open. For reminders that
                  reach you when the browser is closed, use the mobile or desktop app — it
                  schedules them from the same tasks.
                </p>
              </div>
            </Section>

            <Section title="Holidays">
              <Link
                href="/holidays"
                className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--hover)]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Holiday calendars</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {countryNames || "No countries selected"}
                  </p>
                </div>
                <span className="shrink-0 text-muted">›</span>
              </Link>
            </Section>

            <Section title="Categories">
              <Link
                href="/categories"
                className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--hover)]"
              >
                <div>
                  <p className="text-sm font-semibold">Manage categories</p>
                  <p className="text-[12.5px] text-muted">
                    {categories.length} categor{categories.length === 1 ? "y" : "ies"}
                  </p>
                </div>
                <span className="shrink-0 text-muted">›</span>
              </Link>
            </Section>
          </>
        )}

        <Section title="About">
          <Row label="Version" value={APP_VERSION} />
          <Row label="Product" value="MyPlanScheduler" />
          <div className="px-5 py-4">
            <p className="text-[12.5px] text-muted">
              Plan Today · Do More · Live Better. Your tasks, boards and calendar stay in
              sync with the MyPlanScheduler apps for Android, iOS, Windows and macOS.
            </p>
          </div>
        </Section>

        <Section title="Legal">
          <div className="card divide-y divide-divider">
            <Link href="/privacy" className="block px-5 py-3.5 text-sm font-semibold hover:bg-[var(--hover)]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="block px-5 py-3.5 text-sm font-semibold hover:bg-[var(--hover)]">
              Terms of Service
            </Link>
          </div>
        </Section>

        <DeleteAccount />

        <button
          type="button"
          onClick={signOut}
          className="card flex w-full items-center gap-3 px-5 py-4 text-sm font-semibold text-danger"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * Permanently deletes the account and everything in it. Asks for confirmation
 * and re-authentication first, since Firebase refuses to delete an old session.
 */
function DeleteAccount() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user) return null;
  const method = reauthMethod(user);

  async function confirm() {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteAccount(user, password);
      // Deleting the user signs them out, which returns the app to the login page.
    } catch (e) {
      setBusy(false);
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "auth/wrong-password" || code === "auth/invalid-credential"
          ? "That password is not correct."
          : e instanceof Error && !code
            ? e.message
            : "Could not delete the account. Please try again.",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card mb-3 flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-danger"
      >
        <Trash2 className="h-4 w-4" />
        <span>
          Delete account
          <span className="block text-[12px] font-normal text-muted">
            Permanently removes your tasks, files and sign-in
          </span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete your account"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-5">
            <h2 className="text-lg font-bold">Delete your account?</h2>
            <p className="mt-2 text-sm text-muted">
              This permanently deletes your tasks, boards, notes, flows, attachments and sign-in. It
              cannot be undone.
            </p>
            {method === "password" && (
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirm()}
                placeholder="Your password"
                aria-label="Your password"
                className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            )}
            {method === "google" && (
              <p className="mt-3 text-[13px] text-muted">You will be asked to confirm with Google.</p>
            )}
            {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy || (method === "password" && !password)}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-2">{title}</h2>
      <div className="card divide-y divide-divider">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="truncate text-[13px] text-muted">{value}</p>
    </div>
  );
}

/**
 * A labelled `<select>`.
 *
 * A native select is deliberate: it is the accessible, touch-friendly control
 * on mobile web. Its dark-mode appearance is handled by the `color-scheme`
 * rules in globals.css, which is what stops it rendering as a white menu
 * inside the dark UI.
 */
function Choice({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  const id = `setting-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {hint && <p className="text-[12.5px] text-muted">{hint}</p>}
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--primary)]"
      />
    </label>
  );
}
