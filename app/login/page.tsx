"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authErrorMessage, useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } =
    useAuth();
  const router = useRouter();

  const [signUp, setSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      if (signUp) await signUpWithEmail(name, email, password);
      else await signInWithEmail(email, password);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-primary">
          <BarChart3 className="h-8 w-8 text-white" />
        </div>
        <p className="eyebrow">MyPlanScheduler</p>
        <h1 className="mt-1 text-3xl font-bold">{signUp ? "Create account" : "Welcome back"}</h1>

        {error && (
          <p className="mt-5 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
        )}
        {notice && (
          <p className="mt-5 rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{notice}</p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-3">
          {signUp && (
            <input
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            placeholder="Password"
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Please wait…" : signUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setSignUp((v) => !v)}
          >
            {signUp ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          {!signUp && (
            <button
              type="button"
              className="text-muted hover:underline"
              onClick={() =>
                run(async () => {
                  if (!email.trim()) throw { code: "auth/invalid-email" };
                  await resetPassword(email);
                  setNotice("Password reset email sent.");
                })
              }
            >
              Forgot password?
            </button>
          )}
        </div>

        <div className="my-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => run(signInWithGoogle)}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface py-3.5 text-sm font-semibold transition hover:bg-primary-soft disabled:opacity-60"
        >
          <GoogleMark />
          Continue with Google
        </button>

        <p className="mt-6 text-center text-[12px] text-muted">
          By continuing you agree to the{" "}
          <Link href="/terms" className="font-semibold hover:text-primary">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold hover:text-primary">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="mt-6 text-center text-xs text-muted">
          Sign in with Apple is available in the iOS app.
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}
