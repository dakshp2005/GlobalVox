"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Plus,
  X,
  UploadCloud,
  FileCheck2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  Megaphone,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";

interface CampaignRow {
  id: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  campaignName: string;
  status: string;
  total: number;
  stats: Record<string, number>;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setCampaigns(data.campaigns);
      setLoadError(null);
    } catch {
      setLoadError(
        "Could not load campaigns. Check that the database is reachable."
      );
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-strong">
            <Megaphone className="h-3.5 w-3.5" />
            RSVP calling campaigns
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Event campaigns
          </h1>
          <p className="mt-1.5 max-w-lg text-sm text-muted">
            Import an invitee list, launch an AI-voice-agent RSVP campaign, and
            track confirmations in real time.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong active:scale-[0.98]"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> New campaign
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="mt-6">
          <NewCampaignForm
            onCreated={() => {
              setShowForm(false);
              load();
            }}
          />
        </div>
      )}

      <div className="mt-8">
        {loadError ? (
          <ErrorState message={loadError} />
        ) : campaigns === null ? (
          <ListSkeleton />
        ) : campaigns.length === 0 ? (
          <EmptyState onCreate={() => setShowForm(true)} />
        ) : (
          <ul className="flex flex-col gap-3">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign: c }: { campaign: CampaignRow }) {
  const confirmed = c.stats.CONFIRMED ?? 0;
  const declined = c.stats.DECLINED ?? 0;
  const undecided = c.stats.UNDECIDED ?? 0;
  const failed = c.stats.FAILED ?? 0;
  const invalid = c.stats.INVALID ?? 0;
  const resolved = confirmed + declined + undecided + failed + invalid;

  return (
    <li>
      <Link
        href={`/campaigns/${c.id}`}
        className="group block rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-semibold text-foreground">
                {c.campaignName}
              </h2>
              <StatusBadge status={c.status} size="sm" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(c.eventDate).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {c.eventLocation}
              </span>
            </div>
          </div>
          <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:block" />
        </div>

        <div className="mt-4">
          <ProgressBar
            segments={[
              { value: confirmed, color: "bg-emerald-500" },
              { value: declined, color: "bg-rose-500" },
              { value: undecided, color: "bg-amber-400" },
              { value: failed, color: "bg-red-400" },
            ]}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          <StatChip icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} label="Confirmed" value={confirmed} />
          <StatChip icon={<XCircle className="h-3.5 w-3.5 text-rose-600" />} label="Declined" value={declined} />
          <StatChip icon={<HelpCircle className="h-3.5 w-3.5 text-amber-600" />} label="Undecided" value={undecided} />
          <StatChip icon={<Clock className="h-3.5 w-3.5 text-slate-500" />} label="Pending" value={c.total - resolved} />
          <span className="ml-auto font-medium text-muted">
            {c.total.toLocaleString()} invitee{c.total === 1 ? "" : "s"}
          </span>
        </div>
      </Link>
    </li>
  );
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600">
      {icon}
      <span className="font-semibold text-foreground">{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
        <Megaphone className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        No campaigns yet
      </h3>
      <p className="max-w-xs text-sm text-muted">
        Create your first RSVP campaign to start calling invitees and tracking
        responses.
      </p>
      <button
        onClick={onCreate}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
      >
        <Plus className="h-4 w-4" /> New campaign
      </button>
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

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-surface p-5"
        >
          <div className="skeleton h-4 w-48 rounded" />
          <div className="skeleton mt-2 h-3 w-64 rounded" />
          <div className="skeleton mt-4 h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

function NewCampaignForm({ onCreated }: { onCreated: () => void }) {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
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
      setError("Please choose a CSV file of invitees (id,name,phone,email).");
      return;
    }

    setSubmitting(true);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName,
          eventDate,
          eventLocation,
          campaignName,
          csvText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create campaign");
        return;
      }
      setSummary(data.importSummary);
      onCreated();
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
      <h2 className="text-sm font-semibold text-foreground">
        Create a new campaign
      </h2>
      <p className="mt-1 text-xs text-muted">
        Fill in the event details and upload your invitee list to get
        started.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Event name">
          <input
            required
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="input"
            placeholder="GlobalVox Annual Business Meet"
          />
        </Field>
        <Field label="Campaign name">
          <input
            required
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="input"
            placeholder="Annual Business Meet — RSVP"
          />
        </Field>
        <Field label="Event date">
          <input
            required
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Event location">
          <input
            required
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
            className="input"
            placeholder="Ahmedabad"
          />
        </Field>
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-xs font-medium text-slate-600">
          Invitee list (CSV: id, name, phone, email)
        </span>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver
              ? "border-accent bg-accent-soft"
              : file
                ? "border-emerald-300 bg-emerald-50"
                : "border-border bg-slate-50 hover:border-accent/50 hover:bg-accent-soft/50"
          }`}
        >
          {file ? (
            <>
              <FileCheck2 className="h-6 w-6 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-800">
                {file.name}
              </span>
              <span className="text-xs text-emerald-700/80">
                Click to choose a different file
              </span>
            </>
          ) : (
            <>
              <UploadCloud className="h-6 w-6 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                Drag & drop your CSV, or click to browse
              </span>
              <span className="text-xs text-muted">
                Header row required: id,name,phone,email
              </span>
            </>
          )}
          <input
            required
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}
      {summary && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Imported {summary.valid} valid invitee(s), skipped {summary.invalid}{" "}
          invalid row(s) out of {summary.totalRows} total.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/25 transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create campaign"}
      </button>
    </form>
  );
}

function Field({
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
