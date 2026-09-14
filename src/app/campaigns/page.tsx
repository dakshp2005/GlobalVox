"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";

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
    <div className="mx-auto max-w-5xl w-full px-6 py-10 flex-1">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            GlobalVox RSVP Campaigns
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Manage invitee lists, run AI-voice-agent RSVP calling campaigns, and
            track results.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm font-medium hover:bg-zinc-700"
        >
          {showForm ? "Cancel" : "New Campaign"}
        </button>
      </div>

      {showForm && (
        <NewCampaignForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : campaigns === null ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : campaigns.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          No campaigns yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/campaigns/${c.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.campaignName}</div>
                    <div className="text-sm text-zinc-500">
                      {c.eventName} · {c.eventLocation} ·{" "}
                      {new Date(c.eventDate).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-3 flex gap-4 text-xs text-zinc-600">
                  <span>Total: {c.total}</span>
                  <span>Confirmed: {c.stats.CONFIRMED ?? 0}</span>
                  <span>Declined: {c.stats.DECLINED ?? 0}</span>
                  <span>Undecided: {c.stats.UNDECIDED ?? 0}</span>
                  <span>Pending: {c.stats.PENDING ?? 0}</span>
                  <span>Failed: {c.stats.FAILED ?? 0}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewCampaignForm({ onCreated }: { onCreated: () => void }) {
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [campaignName, setCampaignName] = useState("");
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
      className="mb-8 rounded-lg border border-zinc-200 bg-white p-5 space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Event Name">
          <input
            required
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="input"
            placeholder="GlobalVox Annual Business Meet"
          />
        </Field>
        <Field label="Campaign Name">
          <input
            required
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="input"
            placeholder="Annual Business Meet — RSVP"
          />
        </Field>
        <Field label="Event Date">
          <input
            required
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Event Location">
          <input
            required
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
            className="input"
            placeholder="Ahmedabad"
          />
        </Field>
      </div>

      <Field label="Invitee List (CSV: id,name,phone,email)">
        <input
          required
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary && (
        <p className="text-sm text-emerald-700">
          Imported {summary.valid} valid invitee(s), skipped {summary.invalid}{" "}
          invalid row(s) out of {summary.totalRows} total.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Campaign"}
      </button>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #d4d4d8;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
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
      <span className="block text-xs font-medium text-zinc-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
