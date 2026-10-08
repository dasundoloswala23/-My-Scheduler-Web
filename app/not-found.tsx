import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
      <h1 className="text-2xl font-bold">We could not find that page</h1>
      <p className="max-w-sm text-sm text-muted">
        The link may be out of date. Your workspace is safe.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"
      >
        Back to MyPlanScheduler
      </Link>
    </div>
  );
}
