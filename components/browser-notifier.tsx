"use client";

import { useEffect, useRef } from "react";

import { useBrowserNotifications } from "@/lib/browser-notifications";
import { useTasks } from "@/lib/hooks";
import { dueReminders } from "@/lib/reminders";

const POLL_MS = 30_000;
// Wider than the poll, so a tick that runs a little late still catches one.
const WINDOW_MS = 90_000;
const SEEN_KEY = "firedReminders";

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    // Only the recent ones matter; keep the list from growing for ever.
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    // Private mode: the in-memory set still prevents repeats for this page.
  }
}

/**
 * Shows a browser notification when a task reminder comes due.
 *
 * It only runs while a tab is open and the user has both allowed notifications
 * and switched them on in Settings. It renders nothing. Always-on reminders are
 * the mobile and desktop apps' job; this is a convenience for people who keep
 * the web app open.
 */
export function BrowserNotifier() {
  const tasks = useTasks();
  const { status, enabled } = useBrowserNotifications();

  // The latest tasks, read by the timer without restarting it on every change.
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (status !== "granted" || !enabled) return;
    const seen = loadSeen();

    function tick() {
      const due = dueReminders(tasksRef.current, new Date(), WINDOW_MS);
      let changed = false;

      for (const item of due) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        changed = true;

        try {
          const n = new Notification(item.title, {
            body: item.label,
            // The tag makes a repeat of the same reminder replace the old one
            // instead of stacking.
            tag: item.key,
            icon: "/icon-192.png",
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          // Some browsers refuse the constructor outside a secure context.
        }
      }
      if (changed) saveSeen(seen);
    }

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [status, enabled]);

  return null;
}
