"use client";

import { useState } from "react";
import { Cpu, Server } from "lucide-react";
import VoiceCall from "@/components/VoiceCall";
import OfflineCall from "@/components/OfflineCall";
import type { OfflineContext } from "@/lib/useOfflineCall";
import type { AgentVoice } from "@/lib/agentPrompt";

type Mode = "ai" | "offline";

const MODES: { id: Mode; label: string; hint: string; icon: typeof Cpu }[] = [
  { id: "ai", label: "AI model (server)", hint: "Free conversation, needs the model server and is slower", icon: Server },
  { id: "offline", label: "Lite (small model)", hint: "Scripted questions, fast rules plus a small local model; keeps working without internet", icon: Cpu },
];

/** Lets the team compare the two ways of running the voice agent on the same invitee. */
export default function CallPanel({
  inviteeId,
  inviteeName,
  campaignId,
  agentVoice,
  customPrompt,
  context,
  onFinished,
}: {
  inviteeId: string;
  inviteeName: string;
  campaignId: string;
  agentVoice: AgentVoice;
  customPrompt: boolean;
  context: OfflineContext;
  onFinished: () => void;
}) {
  const [mode, setMode] = useState<Mode>("ai");
  const active = MODES.find((m) => m.id === mode)!;

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Voice agent mode" className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === m.id ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            <m.icon className="h-4 w-4" /> {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 px-1 text-xs text-muted">{active.hint}</p>

      {mode === "ai" ? (
        <div className="-mt-2">
          <VoiceCall
            inviteeId={inviteeId}
            inviteeName={inviteeName}
            campaignId={campaignId}
            agentVoice={agentVoice}
            customPrompt={customPrompt}
            onFinished={onFinished}
          />
        </div>
      ) : (
        <OfflineCall
          inviteeId={inviteeId}
          inviteeName={inviteeName}
          context={context}
          onFinished={onFinished}
        />
      )}
    </div>
  );
}
