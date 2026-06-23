"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Credentials for the seeded test account (scripts/seed-test-user.ts).
const TEST_EMAIL = "test@ragstudio.dev";
const TEST_PASSWORD = "Test@1234!";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  async function login(withEmail: string, withPassword: string) {
    setError("");

    const result = await signIn("credentials", {
      email: withEmail,
      password: withPassword,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password.");
      return false;
    }

    router.push("/");
    router.refresh();
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await login(email, password);
    setLoading(false);
  }

  async function handleTestLogin() {
    setTestLoading(true);
    setEmail(TEST_EMAIL);
    setPassword(TEST_PASSWORD);
    const ok = await login(TEST_EMAIL, TEST_PASSWORD);
    if (!ok) {
      setError(
        "Test account not found. Run: npx tsx scripts/seed-test-user.ts"
      );
    }
    setTestLoading(false);
  }

  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
            <p className="text-sm text-white/50">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-widest text-white/50">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-amber-300/50 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-widest text-white/50">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-amber-300/50 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-2 text-xs text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || testLoading}
              className="mt-2 rounded-full bg-amber-300 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div className="my-1 flex items-center gap-3 text-[10px] uppercase tracking-widest text-white/30">
              <span className="h-px flex-1 bg-white/10" />
              or
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleTestLogin}
              disabled={loading || testLoading}
              className="rounded-full border border-white/15 py-2.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testLoading ? "Signing in..." : "Sign in as Test User"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/40">
            No account?{" "}
            <Link
              href="/auth/register"
              className="text-amber-300 hover:text-amber-200 transition"
            >
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
