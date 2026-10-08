"use client";

import { useEffect } from "react";

import { usePreferences } from "@/lib/preferences";

/**
 * Applies the account's theme preference to the document.
 *
 * The preference itself lives in Firestore so it follows the user between
 * devices and stays in step with the Flutter apps. A copy is mirrored into
 * `localStorage` purely so the inline bootstrap in the root layout can set the
 * attribute before first paint; the mirror is never the source of truth.
 */
export function ThemeSync() {
  const { preferences, loading } = usePreferences();

  useEffect(() => {
    if (loading) return;
    const root = document.documentElement;

    if (preferences.themeMode === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", preferences.themeMode);
    }

    try {
      localStorage.setItem("theme", preferences.themeMode);
    } catch {
      // Private mode or blocked storage: the theme still applies for this
      // session, it just cannot pre-empt the flash on the next load.
    }
  }, [preferences.themeMode, loading]);

  return null;
}
