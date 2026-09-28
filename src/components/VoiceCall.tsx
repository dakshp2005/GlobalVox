"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Mic,
  PhoneCall,
  PhoneOff,
  Send,
  Volume2,
} from "lucide-react";
import { LANGUAGES, useVoiceCall, type CallPhase, type MicStatus } from "@/lib/useVoiceCall";
import type { Lang } from "@/lib/voiceLines";

const MIC_LABEL: Record<MicStatus, string> = {
  off: "Microphone off — type your reply",
  starting: "Starting microphone…",
  waiting: "Your turn — speak now",
  sound: "Hearing sound…",
  speech: "Speech detected",
};

const PHASE_LABEL: Record<CallPhase, string> = {
  idle: "Ready to call",
  connecting: "Connecting to the voice agent…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Agent is speaking",
  ending: "Saving the call result…",
  done: "Call finished",
  error: "Call failed",
};

export default function VoiceCall({
  inviteeId,
  inviteeName,
  onFinished,
}: {
  inviteeId: string;
  inviteeName: string;
  onFinished: () => void;
}) {
  const [result, setResult] = useState<{ outcome: string; summary: string } | null>(null);
  const [text, setText] = useState("");
  const call = useVoiceCall(inviteeId, (r) => {
    setResult(r);
    onFinished();
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [call.turns, call.interim]);

  const inCall = ["connecting", "listening", "thinking", "speaking"].includes(call.phase);
  const busy = call.phase === "connecting" || call.phase === "ending";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    void call.sendText(text);
    setText("");
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <PhoneCall className="h-4 w-4 text-muted" /> AI voice call
          </h2>
          <p
            className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"
            aria-live="polite"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {call.phase === "listening" && <Mic className="h-3 w-3 text-accent" />}
            {call.phase === "speaking" && <Volume2 className="h-3 w-3 text-accent" />}
            {PHASE_LABEL[call.phase]}
            {inCall && ` · ${call.seconds}s`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!inCall && (
            <select
              value={call.lang}
              onChange={(e) => call.setLang(e.target.value as Lang)}
              disabled={busy}
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
              disabled={call.phase === "connecting"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              <PhoneOff className="h-4 w-4" /> End call
            </button>
          ) : (
            <button
              onClick={() => {
                setResult(null);
                void call.start();
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <PhoneCall className="h-4 w-4" />
              {call.phase === "done" || call.phase === "error" ? "Call again" : `Call ${inviteeName.split(" ")[0]}`}
            </button>
          )}
        </div>
      </div>

      {!call.micSupported && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Voice input needs Chrome or Edge. You can still talk to the agent by typing below.
        </p>
      )}

      {inCall && call.micSupported && (
        <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span
              className={
                call.phase === "listening" && call.micStatus !== "off"
                  ? "font-semibold text-accent"
                  : "text-muted"
              }
            >
              {call.phase === "listening"
                ? MIC_LABEL[call.micStatus]
                : "Wait for the agent to finish, then speak"}
            </span>
            <span
              className="hidden max-w-[45%] truncate text-muted sm:block"
              title={call.micLabel}
            >
              {call.micLabel || "Default microphone"}
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
          No {LANGUAGES.find((l) => l.code === call.lang)?.label} voice is installed in this
          browser, so the agent&apos;s replies will appear as text only. For spoken Hindi and
          Gujarati, open this page in Microsoft Edge (it includes free Hindi and Gujarati
          voices), or add the language under Windows Settings → Time &amp; language → Speech.
        </p>
      )}

      {call.notice && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {call.notice}
        </p>
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

      {result && call.phase === "done" && (
        <div className="mt-4 rounded-lg bg-accent-soft px-3.5 py-2.5 text-sm text-foreground">
          <span className="font-semibold">Result: {result.outcome.replace("_", " ")}</span>
          {result.summary && <span className="text-muted"> — {result.summary}</span>}
        </div>
      )}

      {inCall && (
        <div className="mt-3 flex flex-col gap-2">
          {call.phase === "speaking" && (
            <button
              onClick={call.interrupt}
              className="self-start text-xs font-medium text-accent hover:underline"
            >
              Interrupt the agent
            </button>
          )}
          <form onSubmit={submit} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Or type your reply…"
              disabled={call.phase === "connecting"}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!text.trim() || call.phase === "connecting"}
              aria-label="Send reply"
              className="rounded-lg border border-border px-3 text-muted transition-colors hover:text-accent disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
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
