"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";

interface Invitee {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  attemptCount: number;
  invalidReason: string | null;
}

interface CampaignDetail {
  campaign: {
    id: string;
    eventName: string;
    eventDate: string;
    eventLocation: string;
    campaignName: string;
    status: string;
  };
  stats: Record<string, number>;
  total: number;
  invitees: Invitee[];
  pagination: { page: number; pageSize: number; filteredCount: number };
}

const STATUS_TABS = [
  "ALL",
  "CONFIRMED",
  "DECLINED",
  "UNDECIDED",
  "PENDING",
  "IN_PROGRESS",
  "FAILED",
  "INVALID",
];

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/campaigns/${id}?${params.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      setData(json);
      setLoadError(null);
      return json as CampaignDetail;
    } catch {
      setLoadError("Could not load this campaign.");
    }
  }, [id, statusFilter, search, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on filter/page change
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  async function processBatchLoop() {
    setRunning(true);
    const step = async () => {
      const res = await fetch(`/api/campaigns/${id}/process`, {
        method: "POST",
      });
      const json = await res.json();
      await load();
      if (!json.done) {
        pollRef.current = setTimeout(step, 400);
      } else {
        setRunning(false);
      }
    };
    await step();
  }

  async function handleStart() {
    await fetch(`/api/campaigns/${id}/start`, { method: "POST" });
    await load();
    processBatchLoop();
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl w-full px-6 py-10 flex-1">
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl w-full px-6 py-10 flex-1">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  const { campaign, stats, total } = data;
  const pending = stats.PENDING ?? 0;
  const canStart = campaign.status === "DRAFT" && total > 0;

  return (
    <div className="mx-auto max-w-5xl w-full px-6 py-10 flex-1">
      <Link href="/campaigns" className="text-sm text-zinc-500 hover:underline">
        ← All campaigns
      </Link>

      <div className="flex items-center justify-between mt-2 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaign.campaignName}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            {campaign.eventName} · {campaign.eventLocation} ·{" "}
            {new Date(campaign.eventDate).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={campaign.status} />
          {canStart && (
            <button
              onClick={handleStart}
              className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm font-medium hover:bg-zinc-700"
            >
              Start Campaign
            </button>
          )}
          {campaign.status === "RUNNING" && pending > 0 && !running && (
            <button
              onClick={processBatchLoop}
              className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm font-medium hover:bg-zinc-700"
            >
              Resume Calling
            </button>
          )}
          {running && (
            <span className="text-sm text-sky-700">Calling in progress…</span>
          )}
        </div>
      </div>

      <StatsGrid total={total} stats={stats} />

      <div className="mt-8 flex items-center gap-3">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              statusFilter === s
                ? "bg-zinc-900 text-white border-zinc-900"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-500"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name, phone, email…"
          className="ml-auto text-sm border border-zinc-300 rounded-md px-3 py-1.5"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Phone</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Attempts</th>
              <th className="text-left px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.invitees.map((inv) => (
              <tr key={inv.id} className="border-t border-zinc-100">
                <td className="px-4 py-2">{inv.name}</td>
                <td className="px-4 py-2 text-zinc-500">{inv.phone}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={inv.status} />
                  {inv.invalidReason && (
                    <span className="ml-2 text-xs text-zinc-400">
                      {inv.invalidReason}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-500">{inv.attemptCount}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/campaigns/${id}/invitees/${inv.id}`}
                    className="text-xs text-zinc-600 hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {data.invitees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-400">
                  No invitees match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>
          Showing {data.invitees.length} of {data.pagination.filteredCount}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={
              page * data.pagination.pageSize >= data.pagination.filteredCount
            }
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 border rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsGrid({
  total,
  stats,
}: {
  total: number;
  stats: Record<string, number>;
}) {
  const items = [
    { label: "Total Invitees", value: total, color: "text-zinc-900" },
    { label: "Confirmed", value: stats.CONFIRMED ?? 0, color: "text-emerald-700" },
    { label: "Declined", value: stats.DECLINED ?? 0, color: "text-rose-700" },
    { label: "Undecided", value: stats.UNDECIDED ?? 0, color: "text-amber-700" },
    { label: "Pending", value: stats.PENDING ?? 0, color: "text-zinc-600" },
    {
      label: "In Progress",
      value: stats.IN_PROGRESS ?? 0,
      color: "text-sky-700",
    },
    { label: "Failed", value: stats.FAILED ?? 0, color: "text-red-700" },
    { label: "Invalid", value: stats.INVALID ?? 0, color: "text-zinc-400" },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div className={`text-2xl font-semibold ${it.color}`}>
            {it.value.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500 mt-1">{it.label}</div>
        </div>
      ))}
    </div>
  );
}
