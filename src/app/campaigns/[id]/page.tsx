"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  Download,
  RefreshCcw,
  UserPlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";
import CsvDropzone from "@/components/CsvDropzone";

interface Invitee {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  attemptCount: number;
  invalidReason: string | null;
}

interface CampaignInfo {
  id: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  campaignName: string;
  status: string;
}

interface CampaignDetail {
  campaign: CampaignInfo;
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
  const router = useRouter();
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddInvitees, setShowAddInvitees] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const prefetchCache = useRef<Map<string, CampaignDetail>>(new Map());

  const buildParams = useCallback(
    (p: number, sf: string, s: string) => {
      const params = new URLSearchParams();
      if (sf !== "ALL") params.set("status", sf);
      if (s) params.set("search", s);
      params.set("page", String(p));
      return params;
    },
    []
  );

  const loadPage = useCallback(
    async (pageNum: number, sf: string, s: string, signal?: AbortSignal) => {
      const cached = prefetchCache.current.get(`${pageNum}-${sf}-${s}`);
      if (cached) {
        prefetchCache.current.delete(`${pageNum}-${sf}-${s}`);
        return cached;
      }
      const params = buildParams(pageNum, sf, s);
      const res = await fetch(`/api/campaigns/${id}?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as CampaignDetail;
    },
    [id, buildParams]
  );

  const prefetchPage = useCallback(
    (pageNum: number, sf: string, s: string) => {
      const key = `${pageNum}-${sf}-${s}`;
      if (prefetchCache.current.has(key)) return;
      const params = buildParams(pageNum, sf, s);
      fetch(`/api/campaigns/${id}?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json) prefetchCache.current.set(key, json as CampaignDetail);
        })
        .catch(() => {});
    },
    [id, buildParams]
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    loadPage(page, statusFilter, search, controller.signal)
      .then((json) => {
        if (!cancelled && json) {
          setData(json);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this campaign.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loadPage, page, statusFilter, search]);

  useEffect(() => {
    if (!data) return;
    const totalPages = Math.ceil(data.pagination.filteredCount / data.pagination.pageSize);
    if (page > 1) prefetchPage(page - 1, statusFilter, search);
    if (page < totalPages) prefetchPage(page + 1, statusFilter, search);
  }, [data, page, statusFilter, search, prefetchPage]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  async function processBatchLoop() {
    setRunning(true);
    const step = async () => {
      const res = await fetch(`/api/campaigns/${id}/process`, {
        method: "POST",
      });
      const json = await res.json();
      const fresh = await loadPage(page, statusFilter, search);
      if (fresh) setData(fresh);
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
    const fresh = await loadPage(page, statusFilter, search);
    if (fresh) setData(fresh);
    processBatchLoop();
  }

  async function handleRetryFailed() {
    setRetrying(true);
    try {
      await fetch(`/api/campaigns/${id}/retry-failed`, { method: "POST" });
      const fresh = await loadPage(page, statusFilter, search);
      if (fresh) {
        setData(fresh);
        if (fresh.campaign.status === "RUNNING") {
          processBatchLoop();
        }
      }
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      router.push("/campaigns");
    } finally {
      setDeleting(false);
    }
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
  const failed = stats.FAILED ?? 0;
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
            <span className="font-medium text-slate-600">
              {campaign.eventName}
            </span>
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

        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          {failed > 0 && !running && (
            <button
              onClick={handleRetryFailed}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
            >
              <RefreshCcw
                className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`}
              />
              Retry failed ({failed})
            </button>
          )}
          <a
            href={`/api/campaigns/${id}/export`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Download className="h-4 w-4" /> Export CSV
          </a>
          <button
            onClick={() => {
              setShowAddInvitees((s) => !s);
              setShowEdit(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-accent/40 hover:text-accent"
          >
            <UserPlus className="h-4 w-4" /> Add invitees
          </button>
          <button
            onClick={() => {
              setShowEdit((s) => !s);
              setShowAddInvitees(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      {showEdit && (
        <div className="mt-5">
          <EditCampaignForm
            campaign={campaign}
            onSaved={async () => {
              setShowEdit(false);
              const fresh = await loadPage(page, statusFilter, search);
              if (fresh) setData(fresh);
            }}
            onCancel={() => setShowEdit(false)}
          />
        </div>
      )}

      {showAddInvitees && (
        <div className="mt-5">
          <AddInviteesPanel
            campaignId={id}
            onDone={async () => {
              setShowAddInvitees(false);
              const fresh = await loadPage(page, statusFilter, search);
              if (fresh) setData(fresh);
            }}
            onCancel={() => setShowAddInvitees(false)}
          />
        </div>
      )}

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
        <StatCard
          label="Total invitees"
          value={total}
          icon={<Users className="h-4 w-4" />}
          tone="slate"
        />
        <StatCard
          label="Confirmed"
          value={stats.CONFIRMED ?? 0}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label="Declined"
          value={stats.DECLINED ?? 0}
          icon={<XCircle className="h-4 w-4" />}
          tone="rose"
        />
        <StatCard
          label="Undecided"
          value={stats.UNDECIDED ?? 0}
          icon={<HelpCircle className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label="Pending"
          value={pending}
          icon={<Clock className="h-4 w-4" />}
          tone="slate"
        />
        <StatCard
          label="In progress"
          value={inProgress}
          icon={<Loader2 className="h-4 w-4" />}
          tone="sky"
        />
        <StatCard
          label="Failed"
          value={failed}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="red"
        />
        <StatCard
          label="Invalid"
          value={stats.INVALID ?? 0}
          icon={<Ban className="h-4 w-4" />}
          tone="slate"
          faint
        />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setLoading(true);
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
            value={searchInput}
            onChange={(e) => {
              const val = e.target.value;
              setSearchInput(val);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              setLoading(true);
              searchTimerRef.current = setTimeout(() => {
                setSearch(val);
                setPage(1);
              }, 300);
            }}
            placeholder="Search name, phone, email…"
            className="input pl-8"
          />
        </div>
      </div>

      <div className="mt-4">
        {/* Desktop table */}
        <div className="relative hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          )}
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
        <div className="relative sm:hidden">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          )}
          <ul className="flex flex-col gap-2.5">
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
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </span>
          ) : (
            <>Showing {data.invitees.length} of {data.pagination.filteredCount}</>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => {
              setLoading(true);
              setPage((p) => Math.max(1, p - 1));
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <span className="tabular-nums">
            Page {data.pagination.page} of{" "}
            {Math.max(
              1,
              Math.ceil(data.pagination.filteredCount / data.pagination.pageSize)
            )}
          </span>
          <button
            disabled={
              page * data.pagination.pageSize >= data.pagination.filteredCount || loading
            }
            onClick={() => {
              setLoading(true);
              setPage((p) => p + 1);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          campaignName={campaign.campaignName}
          deleting={deleting}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
        />
      )}
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

function EditCampaignForm({
  campaign,
  onSaved,
  onCancel,
}: {
  campaign: CampaignInfo;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [eventName, setEventName] = useState(campaign.eventName);
  const [eventDate, setEventDate] = useState(campaign.eventDate.slice(0, 10));
  const [eventLocation, setEventLocation] = useState(campaign.eventLocation);
  const [campaignName, setCampaignName] = useState(campaign.campaignName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName,
          eventDate,
          eventLocation,
          campaignName,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save changes");
        return;
      }
      onSaved();
    } catch {
      setError("Something went wrong saving changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Edit campaign</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Event name">
          <input
            required
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="input"
          />
        </FormField>
        <FormField label="Campaign name">
          <input
            required
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="input"
          />
        </FormField>
        <FormField label="Event date">
          <input
            required
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="input"
          />
        </FormField>
        <FormField label="Event location">
          <input
            required
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
            className="input"
          />
        </FormField>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddInviteesPanel({
  campaignId,
  onDone,
  onCancel,
}: {
  campaignId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    totalRows: number;
    valid: number;
    invalid: number;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);
    if (!file) {
      setError("Please choose a CSV file of invitees.");
      return;
    }
    setSubmitting(true);
    try {
      const csvText = await file.text();
      const res = await fetch(`/api/campaigns/${campaignId}/invitees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to add invitees");
        return;
      }
      setSummary(json.importSummary);
      onDone();
    } catch {
      setError("Something went wrong reading the file.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Add invitees</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Upload another CSV to append more invitees to this campaign. Phones
        already in this campaign are skipped as duplicates.
      </p>

      <div className="mt-4">
        <CsvDropzone file={file} onFileChange={setFile} />
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}
      {summary && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Added {summary.valid} invitee(s), skipped {summary.invalid} invalid
          row(s) out of {summary.totalRows} total.
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add invitees"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteConfirmModal({
  campaignName,
  deleting,
  onCancel,
  onConfirm,
}: {
  campaignName: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
          <Trash2 className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-foreground">
          Delete &ldquo;{campaignName}&rdquo;?
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          This permanently deletes the campaign along with all of its invitees
          and call history. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
