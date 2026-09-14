"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, LogIn } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not log in");
        return;
      }
      router.push(searchParams.get("from") || "/campaigns");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          GV
        </span>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
          Log in to GlobalVox
        </h1>
        <p className="mt-1 text-sm text-muted">
          Manage your RSVP campaigns. Accounts are set up by the GlobalVox
          team — contact an admin if you need access.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="space-y-4">
          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="jane@globalvoxinc.com"
              autoFocus
            />
          </Field>
          <Field label="Password">
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        {error && (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" />
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
