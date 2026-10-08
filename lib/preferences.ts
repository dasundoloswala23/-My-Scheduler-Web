import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "./auth-context";
import { db } from "./firebase";
import type { Priority } from "./types";

/**
 * User preferences, stored on `users/{uid}.appPreferences`.
 *
 * This is the SAME document field the Flutter app writes, and every key and
 * enum value below matches `AppPreferences.toJson()` there exactly. Changing a
 * name on one side without the other silently desynchronises the two clients,
 * so treat this shape as a contract rather than as local state.
 */
export type ThemeMode = "system" | "light" | "dark";
export type CalendarViewPref = "day" | "threeDay" | "week" | "month" | "agenda";
export type CalendarDensity = "compact" | "comfortable" | "detailed";

export interface AppPreferences {
  themeMode: ThemeMode;
  calendarDefaultView: CalendarViewPref;
  /** Hour the time grid scrolls to on open. Earlier hours stay reachable. */
  calendarScrollHour: number;
  weekStartsOnMonday: boolean;
  showWeekends: boolean;
  calendarDensity: CalendarDensity;
  showSubtasksOnCards: boolean;
  /** How many subtasks a card shows before collapsing the rest. */
  subtaskPreviewCount: number;
  defaultPriority: Priority;
  defaultCategoryId: string | null;
  /** ISO 3166-1 alpha-2 codes. Empty means no holidays are shown. */
  holidayCountries: string[];
  /** Holiday category ids the calendar should show. */
  holidayCategories: string[];
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: "system",
  calendarDefaultView: "week",
  calendarScrollHour: 9,
  weekStartsOnMonday: true,
  showWeekends: true,
  calendarDensity: "comfortable",
  showSubtasksOnCards: true,
  subtaskPreviewCount: 4,
  defaultPriority: "none",
  defaultCategoryId: null,
  // Nothing is assumed on the user's behalf: no country until they pick one.
  holidayCountries: [],
  holidayCategories: ["public", "bank", "mercantile"],
};

/** Hour height in the time grid, per layout density. Mirrors the Flutter app. */
export const DENSITY_HOUR_HEIGHT: Record<CalendarDensity, number> = {
  compact: 44,
  comfortable: 56,
  detailed: 76,
};

/** Only the compact layout hides an event's time range. */
export function densityShowsDetail(density: CalendarDensity): boolean {
  return density !== "compact";
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function stringList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Decodes whatever is on the document into a complete, valid object.
 *
 * A value written by a newer build must never throw here, or the whole app
 * fails to render for a user who opened it on another device first.
 */
export function parsePreferences(raw: unknown): AppPreferences {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFERENCES;
  const d = raw as Record<string, unknown>;

  return {
    themeMode: oneOf(d.themeMode, ["system", "light", "dark"] as const, "system"),
    calendarDefaultView: oneOf(
      d.calendarDefaultView,
      ["day", "threeDay", "week", "month", "agenda"] as const,
      "week",
    ),
    calendarScrollHour:
      typeof d.calendarScrollHour === "number"
        ? clamp(Math.round(d.calendarScrollHour), 0, 23)
        : DEFAULT_PREFERENCES.calendarScrollHour,
    weekStartsOnMonday:
      typeof d.weekStartsOnMonday === "boolean" ? d.weekStartsOnMonday : true,
    showWeekends: typeof d.showWeekends === "boolean" ? d.showWeekends : true,
    calendarDensity: oneOf(
      d.calendarDensity,
      ["compact", "comfortable", "detailed"] as const,
      "comfortable",
    ),
    showSubtasksOnCards:
      typeof d.showSubtasksOnCards === "boolean" ? d.showSubtasksOnCards : true,
    subtaskPreviewCount:
      typeof d.subtaskPreviewCount === "number"
        ? clamp(Math.round(d.subtaskPreviewCount), 1, 20)
        : DEFAULT_PREFERENCES.subtaskPreviewCount,
    defaultPriority: oneOf(
      d.defaultPriority,
      ["none", "low", "medium", "high"] as const,
      "none",
    ),
    defaultCategoryId:
      typeof d.defaultCategoryId === "string" ? d.defaultCategoryId : null,
    holidayCountries: stringList(d.holidayCountries, DEFAULT_PREFERENCES.holidayCountries),
    holidayCategories: stringList(d.holidayCategories, DEFAULT_PREFERENCES.holidayCategories),
  };
}

/**
 * Live preferences for the signed-in user, plus a setter that merges.
 *
 * `setDoc(..., { merge: true })` is deliberate: the same user document also
 * holds `notificationPreferences`, which the Flutter app owns. A plain write
 * would delete it.
 */
export function usePreferences(): {
  preferences: AppPreferences;
  save: (patch: Partial<AppPreferences>) => Promise<void>;
  loading: boolean;
} {
  const { user } = useAuth();

  // The uid is stored alongside the values, so signing out or switching
  // account falls back to the defaults by derivation rather than by a
  // setState inside an effect, which would cause a cascading render.
  const [state, setState] = useState<{
    uid: string | null;
    preferences: AppPreferences;
    loaded: boolean;
  }>({ uid: null, preferences: DEFAULT_PREFERENCES, loaded: false });

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        setState({
          uid: user.uid,
          preferences: parsePreferences(snap.data()?.appPreferences),
          loaded: true,
        });
      },
      // A read failure (offline, rules) must still let the app render, with
      // the defaults, rather than hanging on a spinner forever.
      () => setState({ uid: user.uid, preferences: DEFAULT_PREFERENCES, loaded: true }),
    );
    return unsub;
  }, [user]);

  const isCurrent = !!user && state.uid === user.uid;
  const preferences = isCurrent ? state.preferences : DEFAULT_PREFERENCES;

  const save = useCallback(
    async (patch: Partial<AppPreferences>) => {
      if (!user) return;
      // Write the merged object rather than the patch, so a field the Flutter
      // app has not written yet still lands complete. The snapshot above then
      // echoes it back, keeping one source of truth.
      const next = { ...preferences, ...patch };
      setState({ uid: user.uid, preferences: next, loaded: true });
      await setDoc(doc(db, "users", user.uid), { appPreferences: next }, { merge: true });
    },
    [user, preferences],
  );

  return { preferences, save, loading: !!user && !isCurrent };
}
