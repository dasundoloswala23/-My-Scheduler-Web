"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        MyPlanScheduler hit an unexpected problem. Your tasks are saved, so trying again is safe.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
