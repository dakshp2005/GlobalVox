"use client";

import { useRef } from "react";
import { Bot, RotateCcw } from "lucide-react";
import {
  AGENT_PROMPT_MAX,
  AGENT_VOICES,
  DEFAULT_AGENT_PROMPT,
  PROMPT_PLACEHOLDERS,
  type AgentVoice,
} from "@/lib/agentPrompt";

/**
 * Lets the team change what the voice agent says and how: its instructions (persona, tone,
 * what to ask) and its voice. Event facts, today's date, language handling and how to end
 * the call are added by the server on every call, so editing can't break a call.
 */
export default function AgentSettings({
  prompt,
  voice,
  onPromptChange,
  onVoiceChange,
}: {
  prompt: string;
  voice: AgentVoice;
  onPromptChange: (v: string) => void;
  onVoiceChange: (v: AgentVoice) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDefault = prompt.trim() === DEFAULT_AGENT_PROMPT || prompt.trim() === "";

  function insertPlaceholder(key: string) {
    const el = textareaRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      onPromptChange(prompt + token);
      return;
    }
    const start = el.selectionStart ?? prompt.length;
    const end = el.selectionEnd ?? prompt.length;
    onPromptChange(prompt.slice(0, start) + token + prompt.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Bot className="h-3.5 w-3.5 text-muted" /> Voice agent
          </p>
          <p className="mt-0.5 text-xs text-muted">
            How the AI agent talks on this campaign&apos;s calls. It follows the invitee
            into English, Hindi or Gujarati automatically.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Agent voice"
          className="flex gap-1 rounded-lg border border-border bg-background p-0.5"
        >
          {AGENT_VOICES.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={voice === v.id}
              onClick={() => onVoiceChange(v.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                voice === v.id ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {v.label} voice
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="agent-prompt" className="flex items-center gap-2 text-xs font-medium text-slate-600">
          Agent instructions
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isDefault ? "bg-slate-100 text-slate-600" : "bg-accent-soft text-accent"
            }`}
          >
            {isDefault ? "Default" : "Customised"}
          </span>
        </label>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onPromptChange(DEFAULT_AGENT_PROMPT)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-accent"
          >
            <RotateCcw className="h-3 w-3" /> Reset to default
          </button>
        )}
      </div>

      <textarea
        id="agent-prompt"
        ref={textareaRef}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        className="input mt-1.5 min-h-72 font-mono text-xs leading-relaxed"
        maxLength={AGENT_PROMPT_MAX}
        spellCheck={false}
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted">Insert:</span>
          {PROMPT_PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => insertPlaceholder(p.key)}
              title={`Inserts {{${p.key}}}`}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-accent hover:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted">
          {prompt.length.toLocaleString()} / {AGENT_PROMPT_MAX.toLocaleString()}
        </span>
      </div>

      <details className="mt-2 text-[11px] text-muted">
        <summary className="cursor-pointer select-none hover:text-foreground">
          What gets added to every call automatically
        </summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>The event facts above (date, time, venue, other information), so the agent never makes them up.</li>
          <li>Today&apos;s date and time, so &ldquo;call me tomorrow evening&rdquo; becomes a real callback time.</li>
          <li>Speaking in the invitee&apos;s language, with grammar that matches the chosen voice.</li>
          <li>How to end the call, and what to do when the invitee interrupts.</li>
        </ul>
        <p className="mt-1.5">
          The greeting and first question are fixed and spoken in the call&apos;s starting
          language; these instructions steer everything after that.
        </p>
      </details>
    </div>
  );
}
