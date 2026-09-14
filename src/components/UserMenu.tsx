"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden truncate text-xs font-medium text-muted sm:inline">
        {email}
      </span>
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
      >
        <LogOut className="h-3.5 w-3.5" />
        {loggingOut ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
