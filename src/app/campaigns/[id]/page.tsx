"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  PhoneCall,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";

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
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <ErrorState message={loadError} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <DetailSkeleton />
      </div>
    );
  }

  const { campaign, stats, total } = data;
  const pending = stats.PENDING ?? 0;
  const inProgress = stats.IN_PROGRESS ?? 0;
  const canStart = campaign.status === "DRAFT" && total > 0;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All campaigns
      </Link>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {campaign.campaignName}
            </h1>
            <StatusBadge status={campaign.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="font-medium text-slate-600">{campaign.eventName}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {new Date(campaign.eventDate).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {campaign.eventLocation}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {canStart && (
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong"
            >
              <PhoneCall className="h-4 w-4" /> Start campaign
            </button>
          )}
          {campaign.status === "RUNNING" && pending > 0 && !running && (
            <button
              onClick={processBatchLoop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong"
            >
              <PhoneCall className="h-4 w-4" /> Resume calling
            </button>
          )}
          {running && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3.5 py-2.5 text-sm font-medium text-sky-800">
              <Loader2 className="h-4 w-4 animate-spin" /> Calling in progress…
            </span>
          )}
        </div>
      </div>

      <div className="mt-6">
        <ProgressBar
          segments={[
            { value: stats.CONFIRMED ?? 0, color: "bg-emerald-500" },
            { value: stats.DECLINED ?? 0, color: "bg-rose-500" },
            { value: stats.UNDECIDED ?? 0, color: "bg-amber-400" },
            { value: stats.IN_PROGRESS ?? 0, color: "bg-sky-400" },
            { value: stats.FAILED ?? 0, color: "bg-red-400" },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total invitees" value={total} icon={<Users className="h-4 w-4" />} tone="slate" />
        <StatCard label="Confirmed" value={stats.CONFIRMED ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Declined" value={stats.DECLINED ?? 0} icon={<XCircle className="h-4 w-4" />} tone="rose" />
        <StatCard label="Undecided" value={stats.UNDECIDED ?? 0} icon={<HelpCircle className="h-4 w-4" />} tone="amber" />
        <StatCard label="Pending" value={pending} icon={<Clock className="h-4 w-4" />} tone="slate" />
        <StatCard label="In progress" value={inProgress} icon={<Loader2 className="h-4 w-4" />} tone="sky" />
        <StatCard label="Failed" value={stats.FAILED ?? 0} icon={<AlertTriangle className="h-4 w-4" />} tone="red" />
        <StatCard label="Invalid" value={stats.INVALID ?? 0} icon={<Ban className="h-4 w-4" />} tone="slate" faint />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "border-accent bg-accent text-white"
                  : "border-border text-slate-600 hover:border-accent/40 hover:text-accent"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, phone, email…"
            className="input pl-8"
          />
        </div>
      </div>

      <div className="mt-4">
        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Phone</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Attempts</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.invitees.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-border/70 transition-colors hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {inv.name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{inv.phone}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={inv.status} size="sm" />
                      {inv.invalidReason && (
                        <span className="truncate text-xs text-slate-400">
                          {inv.invalidReason}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {inv.attemptCount}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/campaigns/${id}/invitees/${inv.id}`}
                      className="text-xs font-semibold text-accent hover:text-accent-strong"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {data.invitees.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-muted"
                  >
                    No invitees match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="flex flex-col gap-2.5 sm:hidden">
          {data.invitees.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/campaigns/${id}/invitees/${inv.id}`}
                className="block rounded-xl border border-border bg-surface p-3.5 active:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {inv.name}
                  </span>
                  <StatusBadge status={inv.status} size="sm" />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>{inv.phone}</span>
                  <span>{inv.attemptCount} attempt(s)</span>
                </div>
                {inv.invalidReason && (
                  <div className="mt-1 text-xs text-slate-400">
                    {inv.invalidReason}
                  </div>
                )}
              </Link>
            </li>
          ))}
          {data.invitees.length === 0 && (
            <li className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
              No invitees match this filter.
            </li>
          )}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>
          Showing {data.invitees.length} of {data.pagination.filteredCount}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            disabled={
              page * data.pagination.pageSize >= data.pagination.filteredCount
            }
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  slate: "text-slate-600 bg-slate-100",
  emerald: "text-emerald-700 bg-emerald-50",
  rose: "text-rose-700 bg-rose-50",
  amber: "text-amber-700 bg-amber-50",
  sky: "text-sky-700 bg-sky-50",
  red: "text-red-700 bg-red-50",
};

function StatCard({
  label,
  value,
  icon,
  tone,
  faint,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: keyof typeof TONE;
  faint?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-3.5 sm:p-4 ${
        faint ? "opacity-70" : ""
      }`}
    >
      <div
        className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md ${TONE[tone]}`}
      >
        {icon}
      </div>
      <div className="text-xl font-bold text-foreground sm:text-2xl">
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-muted sm:text-xs">
        {label}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <div className="skeleton h-4 w-24 rounded" />
      <div className="skeleton mt-4 h-7 w-72 rounded" />
      <div className="skeleton mt-2 h-4 w-56 rounded" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
