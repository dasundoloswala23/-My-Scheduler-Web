"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Browser notification support.
 *
 * Be clear about what this is. The web app has no service worker and no push
 * server, so a browser notification can only appear while a MyPlanScheduler tab
 * is open. Real, always-on reminders come from the mobile and desktop apps,
 * which schedule from the same task data. The Settings page says so, so nobody
 * relies on the browser to wake them up.
 */

export type NotificationStatus =
  /** The browser has no Notification API at all. */
  | "unsupported"
  /** Not asked yet. The user can be prompted, once, on a click. */
  | "default"
  | "granted"
  /** The user said no. The page cannot ask again; only browser settings can. */
  | "denied";

const ENABLED_KEY = "browserNotificationsEnabled";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readStatus(): NotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Whether the user switched in-tab alerts on. Per browser, because
 * notification permission itself is per browser, so syncing it to the account
 * would claim something that is not true on another device.
 */
export function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeEnabled(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    // Private mode: the choice still holds for this page load via the state.
  }
  emit();
}

/**
 * Asks for permission. Only ever call this from a click handler.
 *
 * It is deliberately not called on page load: a prompt nobody asked for is the
 * quickest way to get it permanently denied, and once denied the page can never
 * ask again. A prior "denied" or "granted" short-circuits, so the user is never
 * asked twice.
 */
export async function requestPermission(): Promise<NotificationStatus> {
  const current = readStatus();
  if (current !== "default") {
    if (current === "granted") writeEnabled(true);
    return current;
  }
  const result = await Notification.requestPermission();
  if (result === "granted") writeEnabled(true);
  emit();
  return result;
}

export function setEnabled(on: boolean) {
  writeEnabled(on);
}

export function useBrowserNotifications(): {
  status: NotificationStatus;
  enabled: boolean;
  request: () => Promise<NotificationStatus>;
  setEnabled: (on: boolean) => void;
} {
  // `useSyncExternalStore` keeps the value correct on the server render too,
  // where there is no window: it reports "unsupported" until the client takes
  // over, rather than mismatching during hydration.
  const status = useSyncExternalStore(subscribe, readStatus, () => "unsupported" as const);
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
  const request = useCallback(() => requestPermission(), []);
  return { status, enabled, request, setEnabled };
}

/** Plain-language state for the Settings row. */
export function describeStatus(status: NotificationStatus, enabled: boolean): string {
  switch (status) {
    case "unsupported":
      return "This browser does not support notifications.";
    case "denied":
      return "Blocked. Allow notifications for this site in your browser settings to turn this on.";
    case "default":
      return "Not enabled yet.";
    case "granted":
      return enabled
        ? "On. Reminders appear while a MyPlanScheduler tab is open."
        : "Allowed, but switched off here.";
  }
}
