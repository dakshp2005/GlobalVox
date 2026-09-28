"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CloudOff,
  Cpu,
  Loader2,
  Mic,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  Send,
  Wifi,
} from "lucide-react";
import { LANGUAGES } from "@/lib/useVoiceCall";
import { useOfflineCall, type OfflineContext, type OfflinePhase } from "@/lib/useOfflineCall";
import type { Lang } from "@/lib/voiceLines";

const PHASE_LABEL: Record<OfflinePhase, string> = {
  idle: "Ready to call",
  loading: "Loading the on-device speech model…",
  listening: "Your turn — speak now",
  thinking: "Understanding your answer…",
  speaking: "Agent is speaking",
  saving: "Saving…",
  done: "Call finished",
  error: "Call failed",
};

export default function OfflineCall({
  inviteeId,
  inviteeName,
  context,
  onFinished,
}: {
  inviteeId: string;
  inviteeName: string;
  context: OfflineContext;
  onFinished: () => void;
}) {
  const call = useOfflineCall(inviteeId, context, onFinished);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [call.turns, call.interim]);

  const inCall = ["loading", "listening", "thinking", "speaking"].includes(call.phase);
  const langLabel = LANGUAGES.find((l) => l.code === call.lang)?.label;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    void call.sendText(text);
    setText("");
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Cpu className="h-4 w-4 text-muted" /> Lite call — rules + small model
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            {call.phase === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
            {call.phase === "listening" && <Mic className="h-3 w-3 text-accent" />}
            {PHASE_LABEL[call.phase]}
            {call.phase === "loading" && call.progress > 0 && call.progress < 100 && ` ${call.progress}%`}
            {inCall && call.phase !== "loading" && ` · ${call.seconds}s`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!inCall && (
            <select
              value={call.lang}
              onChange={(e) => call.setLang(e.target.value as Lang)}
              aria-label="Call language"
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
          {inCall ? (
            <button
              onClick={() => void call.endCall()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <PhoneOff className="h-4 w-4" /> End call
            </button>
          ) : (
            <button
              onClick={() => void call.start()}
              disabled={call.phase === "saving"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <PhoneCall className="h-4 w-4" />
              {call.phase === "done" || call.phase === "error"
                ? "Call again"
                : `Call ${inviteeName.split(" ")[0]}`}
            </button>
          )}
        </div>
      </div>

      {/* Connectivity + sync: the point of this mode */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${
            call.online ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {call.online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
          {call.online ? "Online" : call.simulated ? "Offline (simulated)" : "Offline"}
        </span>
        <label className="inline-flex items-center gap-1.5 text-muted">
          <input
            type="checkbox"
            checked={call.simulated}
            onChange={(e) => call.setSimulatedOffline(e.target.checked)}
          />
          Simulate no internet
        </label>
        <span className="text-muted">
          {call.pending > 0
            ? `${call.pending} result${call.pending === 1 ? "" : "s"} saved on this device, waiting to sync`
            : "All results synced"}
        </span>
        {call.pending > 0 && call.online && (
          <button
            onClick={() => void call.syncNow()}
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> Sync now
          </button>
        )}
      </div>

      {(call.engine || call.understood) && (
        <p className="mt-2 text-xs text-muted">
          {call.engine === "chrome" && "Speech input: Chrome (online). "}
          {call.engine === "vosk" && "Speech input: on-device (works offline). "}
          {call.understood?.by === "rules" &&
            `Last answer understood by rules in ${call.understood.ms} ms.`}
          {call.understood?.by === "model" &&
            `Last answer understood by the small model in ${call.understood.ms} ms.`}
          {call.understood?.by === "none" &&
            "Last answer wasn't understood and the small model is unavailable, so the question was repeated."}
        </p>
      )}

      {call.phase === "loading" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${call.progress}%` }}
          />
        </div>
      )}

      {inCall && call.phase !== "loading" && call.micLabel && (
        <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>Microphone level</span>
            <span className="hidden max-w-[55%] truncate sm:block" title={call.micLabel}>
              {call.micLabel}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border"
            role="meter"
            aria-label="Microphone level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(call.micLevel * 100)}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-100"
              style={{ width: `${Math.round(call.micLevel * 100)}%` }}
            />
          </div>
        </div>
      )}

      {call.voiceMissing && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No offline {langLabel} voice is installed on this device, so the agent&apos;s replies
          appear as text only. Offline voices come from the operating system (English works with
          Windows&apos; built-in voices; add other languages under Settings → Time &amp; language →
          Speech).
        </p>
      )}

      {call.notice && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{call.notice}</p>
      )}

      {call.error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {call.error}
        </p>
      )}

      {(call.turns.length > 0 || call.interim) && (
        <div
          ref={scrollRef}
          className="mt-4 flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-background p-3"
        >
          {call.turns.map((t, i) => (
            <Bubble key={i} role={t.role} content={t.content} />
          ))}
          {call.interim && <Bubble role="user" content={call.interim} faded />}
        </div>
      )}

      {call.latency.last !== null && (
        <p className="mt-3 text-xs text-muted">
          <span className="font-semibold text-foreground">Reply speed:</span> the agent started
          answering {call.latency.last} ms after you finished (average {call.latency.avg} ms). The AI
          model mode typically needs several seconds on this PC.
        </p>
      )}

      {call.result && call.phase === "done" && (
        <div className="mt-4 rounded-lg bg-accent-soft px-3.5 py-2.5 text-sm text-foreground">
          <span className="font-semibold">Result: {call.result.outcome.replace("_", " ")}</span>
          <span className="text-muted"> — {call.result.summary}</span>
        </div>
      )}

      {inCall && call.phase !== "loading" && (
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or type your reply…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send reply"
            className="rounded-lg border border-border px-3 text-muted transition-colors hover:text-accent disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}

function Bubble({
  role,
  content,
  faded,
}: {
  role: "agent" | "user";
  content: string;
  faded?: boolean;
}) {
  const agent = role === "agent";
  return (
    <div className={`flex ${agent ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          agent ? "bg-surface text-foreground ring-1 ring-border" : "bg-accent text-white"
        } ${faded ? "opacity-60" : ""}`}
      >
        {content}
      </div>
    </div>
  );
}
