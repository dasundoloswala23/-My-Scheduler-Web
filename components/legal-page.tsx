import Link from "next/link";

import { APP_NAME, LEGAL_UPDATED, type LegalSection } from "@/lib/legal-content";

/** A public page (no sign-in needed), so it can be used as a store listing URL. */
export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <Link href="/" className="text-[12px] font-semibold text-muted hover:text-primary">
        ← {APP_NAME}
      </Link>
      <h1 className="mt-3 text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        {APP_NAME} · Last updated {LEGAL_UPDATED}
      </p>
      {sections.map((s) => (
        <section key={s.heading} className="mt-6">
          <h2 className="text-base font-bold">{s.heading}</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed">{s.body}</p>
        </section>
      ))}
      <p className="mt-10 text-[12.5px] text-muted">
        <Link href="/privacy" className="font-semibold hover:text-primary">
          Privacy Policy
        </Link>
        {" · "}
        <Link href="/terms" className="font-semibold hover:text-primary">
          Terms of Service
        </Link>
      </p>
    </main>
  );
}
