"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  Megaphone,
  CalendarClock,
  RefreshCcw,
  PhoneOff,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

interface CallAttempt {
  id: string;
  attemptNumber: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  outcome: string | null;
  errorMessage: string | null;
}

interface InviteeDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  attemptCount: number;
  invalidReason: string | null;
  campaign: {
    id: string;
    campaignName: string;
    eventName: string;
  };
  callAttempts: CallAttempt[];
}

export default function InviteeDetailPage() {
  const { id, inviteeId } = useParams<{ id: string; inviteeId: string }>();
  const [invitee, setInvitee] = useState<InviteeDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/invitees/${inviteeId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setInvitee(d.invitee))
      .catch(() => setError(true));
  }, [inviteeId]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
          Could not load this invitee.
        </p>
      </div>
    );
  }

  if (!invitee) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="skeleton mt-6 h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={`/campaigns/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to {invitee.campaign.campaignName}
      </Link>

      <div className="mt-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {invitee.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              {invitee.campaign.eventName}
            </p>
          </div>
          <StatusBadge status={invitee.status} />
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-2">
          <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={invitee.phone} />
          <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={invitee.email ?? "—"} />
          <InfoRow icon={<Megaphone className="h-4 w-4" />} label="Campaign" value={invitee.campaign.campaignName} />
          <InfoRow icon={<RefreshCcw className="h-4 w-4" />} label="Call attempts" value={String(invitee.attemptCount)} />
        </dl>

        {invitee.invalidReason && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            <PhoneOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Import issue: {invitee.invalidReason}</span>
          </div>
        )}
      </div>

      <h2 className="mt-8 mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <CalendarClock className="h-4 w-4 text-muted" /> Call history
      </h2>
      {invitee.callAttempts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          No calls have been made yet.
        </div>
      ) : (
        <ol className="relative flex flex-col gap-3 border-l border-border pl-5">
          {invitee.callAttempts.map((c) => (
            <li key={c.id} className="relative">
              <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-accent-soft" />
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    Attempt {c.attemptNumber}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {new Date(c.startedAt).toLocaleString()} ·{" "}
                    {c.durationSeconds ?? 0}s
                    {c.errorMessage ? ` · ${c.errorMessage}` : ""}
                  </div>
                </div>
                {c.outcome && <StatusBadge status={c.outcome} size="sm" />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className="text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}
