"use client";

import { Calendar } from "@/components/calendar";

export default function CalendarPage() {
  return (
    <div className="py-5">
      <div className="px-5 md:px-8">
        <p className="eyebrow">Calendar</p>
        <h1 className="mb-4 text-3xl font-bold">Schedule</h1>
      </div>
      <Calendar />
    </div>
  );
}
