"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

  useEffect(() => {
    fetch(`/api/invitees/${inviteeId}`)
      .then((r) => r.json())
      .then((d) => setInvitee(d.invitee));
  }, [inviteeId]);

  if (!invitee) {
    return (
      <div className="mx-auto max-w-3xl w-full px-6 py-10 flex-1">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl w-full px-6 py-10 flex-1">
      <Link
        href={`/campaigns/${id}`}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← Back to {invitee.campaign.campaignName}
      </Link>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{invitee.name}</h1>
          <StatusBadge status={invitee.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-zinc-500">Phone</dt>
          <dd>{invitee.phone}</dd>
          <dt className="text-zinc-500">Email</dt>
          <dd>{invitee.email ?? "—"}</dd>
          <dt className="text-zinc-500">Campaign</dt>
          <dd>{invitee.campaign.campaignName}</dd>
          <dt className="text-zinc-500">Event</dt>
          <dd>{invitee.campaign.eventName}</dd>
          <dt className="text-zinc-500">Call attempts</dt>
          <dd>{invitee.attemptCount}</dd>
          {invitee.invalidReason && (
            <>
              <dt className="text-zinc-500">Import issue</dt>
              <dd className="text-red-600">{invitee.invalidReason}</dd>
            </>
          )}
        </dl>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-zinc-700">
        Call History
      </h2>
      {invitee.callAttempts.length === 0 ? (
        <p className="text-sm text-zinc-400">No calls have been made yet.</p>
      ) : (
        <ul className="space-y-2">
          {invitee.callAttempts.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-sm flex items-center justify-between"
            >
              <div>
                <div className="font-medium">Attempt {c.attemptNumber}</div>
                <div className="text-zinc-500 text-xs mt-0.5">
                  {new Date(c.startedAt).toLocaleString()} ·{" "}
                  {c.durationSeconds ?? 0}s
                  {c.errorMessage ? ` · ${c.errorMessage}` : ""}
                </div>
              </div>
              {c.outcome && <StatusBadge status={c.outcome} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
