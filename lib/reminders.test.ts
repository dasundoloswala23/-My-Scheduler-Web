import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeOffset,
  dueReminders,
  effectiveReminders,
  fireTimeFor,
  newReminder,
  parseReminder,
  reminderToJson,
  splitOffset,
  type TaskReminder,
} from "./reminders.ts";

/**
 * These mirror the Flutter app's reminder tests. Both clients read and write
 * the same `reminders` array, so they have to agree on what it means.
 */

function reminder(partial: Partial<TaskReminder> = {}): TaskReminder {
  return { ...newReminder("t1", 30), ...partial };
}

describe("round-tripping a reminder", () => {
  it("keeps fields this client does not know about", () => {
    // The mobile app adds per-reminder settings over time. A web edit that
    // dropped them would silently turn someone's alarm back into a plain
    // notification, so they must come back out exactly as they went in.
    const stored = {
      id: "r1",
      taskId: "t1",
      type: "beforeTask",
      offsetMinutes: 5,
      absoluteDateTime: null,
      enabled: true,
      notificationId: 42,
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
      alertStyle: "alarm",
      sound: "urgent",
      vibrate: true,
    };

    const parsed = parseReminder(stored);
    assert.ok(parsed);
    const written = reminderToJson(parsed);

    assert.equal(written.alertStyle, "alarm");
    assert.equal(written.sound, "urgent");
    assert.equal(written.vibrate, true);
    assert.deepEqual(written, stored);
  });

  it("does not let an unknown field overwrite a known one", () => {
    const parsed = parseReminder({ id: "r1", taskId: "t1", type: "atTime" });
    assert.ok(parsed);
    parsed.extra = { id: "hijacked" };
    assert.equal(reminderToJson(parsed).id, "r1");
  });

  it("falls back to safe defaults for a malformed document", () => {
    const parsed = parseReminder({ type: "somethingNew", offsetMinutes: "x" });
    assert.ok(parsed);
    assert.equal(parsed.type, "beforeTask");
    assert.equal(parsed.offsetMinutes, 0);
    assert.equal(parsed.enabled, true);
  });

  it("rejects something that is not an object", () => {
    assert.equal(parseReminder(null), null);
    assert.equal(parseReminder("x"), null);
  });
});

describe("effective reminders", () => {
  it("prefers the rich list when it has entries", () => {
    const rich = [reminder({ id: "r1" })];
    const result = effectiveReminders({ id: "t1", reminders: rich, reminderOffsets: [60] });
    assert.deepEqual(result.map((r) => r.id), ["r1"]);
  });

  it("falls back to legacy offsets with the same ids Flutter uses", () => {
    const result = effectiveReminders({
      id: "t1",
      reminders: [],
      reminderOffsets: [0, 15],
    });
    assert.deepEqual(result.map((r) => r.id), ["legacy-0", "legacy-15"]);
    assert.equal(result[0].type, "atTime");
    assert.equal(result[1].type, "beforeTask");
    assert.equal(result[1].offsetMinutes, 15);
  });

  it("is empty for a task with no reminders at all", () => {
    assert.deepEqual(effectiveReminders({ id: "t1", reminders: [], reminderOffsets: [] }), []);
  });
});

describe("fire times", () => {
  const start = new Date(2026, 9, 8, 18, 0); // 6:00 PM

  it("subtracts the offset from the start", () => {
    const fires = fireTimeFor(reminder({ offsetMinutes: 30 }), start);
    assert.deepEqual(fires, new Date(2026, 9, 8, 17, 30));
  });

  it("moves with the task, which is what rescheduling relies on", () => {
    // 6 PM with a 30 minute reminder fires at 5:30 PM. Move the task to 8 PM
    // and the same reminder now fires at 7:30 PM — nothing else is stored.
    const r = reminder({ offsetMinutes: 30 });
    assert.deepEqual(fireTimeFor(r, start), new Date(2026, 9, 8, 17, 30));
    assert.deepEqual(
      fireTimeFor(r, new Date(2026, 9, 8, 20, 0)),
      new Date(2026, 9, 8, 19, 30),
    );
  });

  it("fires at the start time for an at-time reminder", () => {
    assert.deepEqual(fireTimeFor(reminder({ type: "atTime", offsetMinutes: 0 }), start), start);
  });

  it("uses the absolute time for a custom-time reminder, ignoring the task", () => {
    const r = reminder({
      type: "customTime",
      absoluteDateTime: new Date(2026, 9, 7, 9, 0).toISOString(),
    });
    assert.deepEqual(fireTimeFor(r, start), new Date(2026, 9, 7, 9, 0));
    assert.deepEqual(fireTimeFor(r, null), new Date(2026, 9, 7, 9, 0));
  });

  it("cannot place an offset reminder on an unscheduled task", () => {
    assert.equal(fireTimeFor(reminder({ offsetMinutes: 30 }), null), null);
  });
});

describe("labels", () => {
  it("reads naturally", () => {
    assert.equal(describeOffset(0), "At the time");
    assert.equal(describeOffset(1), "1 minute before");
    assert.equal(describeOffset(45), "45 minutes before");
    assert.equal(describeOffset(60), "1 hour before");
    assert.equal(describeOffset(120), "2 hours before");
    assert.equal(describeOffset(1440), "1 day before");
    assert.equal(describeOffset(2880), "2 days before");
    assert.equal(describeOffset(135), "135 minutes before");
  });

  it("splits an offset into the largest whole unit", () => {
    assert.deepEqual(splitOffset(120), { value: 2, unit: "hours" });
    assert.deepEqual(splitOffset(2880), { value: 2, unit: "days" });
    assert.deepEqual(splitOffset(45), { value: 45, unit: "minutes" });
    assert.deepEqual(splitOffset(0), { value: 0, unit: "minutes" });
  });
});

describe("new reminders", () => {
  it("get a distinct id each time, so two reminders never collide", () => {
    assert.notEqual(newReminder("t1", 30).id, newReminder("t1", 30).id);
  });

  it("use the at-time type for a zero offset", () => {
    assert.equal(newReminder("t1", 0).type, "atTime");
    assert.equal(newReminder("t1", 5).type, "beforeTask");
  });
});

describe("due reminders", () => {
  const start = new Date(2026, 9, 8, 18, 0);
  const task = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    title: "Kitty Meow Video",
    completed: false,
    startDateTime: start,
    reminders: [] as TaskReminder[],
    reminderOffsets: [30],
    ...over,
  });

  it("finds a reminder that just fired", () => {
    const now = new Date(2026, 9, 8, 17, 30, 20); // 20s after the 5:30 fire time
    const due = dueReminders([task()], now, 90_000);
    assert.equal(due.length, 1);
    assert.equal(due[0].title, "Kitty Meow Video");
  });

  it("ignores one that has not fired yet, and one that fired long ago", () => {
    assert.equal(dueReminders([task()], new Date(2026, 9, 8, 17, 29), 90_000).length, 0);
    assert.equal(dueReminders([task()], new Date(2026, 9, 8, 17, 40), 90_000).length, 0);
  });

  it("never fires for a completed task", () => {
    const now = new Date(2026, 9, 8, 17, 30, 20);
    assert.equal(dueReminders([task({ completed: true })], now, 90_000).length, 0);
  });

  it("never fires a disabled reminder", () => {
    const now = new Date(2026, 9, 8, 17, 30, 20);
    const off = [{ ...newReminder("t1", 30), enabled: false }];
    assert.equal(dueReminders([task({ reminders: off })], now, 90_000).length, 0);
  });

  it("gives a rescheduled task a new key, so it alerts again", () => {
    const first = dueReminders([task()], new Date(2026, 9, 8, 17, 30, 20), 90_000)[0];
    const moved = task({ startDateTime: new Date(2026, 9, 8, 20, 0) });
    const second = dueReminders([moved], new Date(2026, 9, 8, 19, 30, 20), 90_000)[0];
    assert.notEqual(first.key, second.key);
  });
});
