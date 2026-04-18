"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get("error");

  const messages: Record<string, string> = {
    CredentialsSignin: "Invalid email or password.",
    Default: "An authentication error occurred.",
  };

  const message = messages[error ?? "Default"] ?? messages.Default;

  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-rose-400/20 bg-rose-400/5 p-8">
          <h1 className="mb-2 text-xl font-semibold text-rose-300">
            Authentication error
          </h1>
          <p className="mb-6 text-sm text-white/60">{message}</p>
          <Link
            href="/auth/signin"
            className="inline-block rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-amber-200"
          >
            Try again
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
