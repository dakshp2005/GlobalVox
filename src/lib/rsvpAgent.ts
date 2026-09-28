import type { CallOutcome } from "@prisma/client";
import { chatJson, type ChatMessage } from "@/lib/ollama";
import { voiceLines, type Lang } from "@/lib/voiceLines";

export interface TranscriptTurn {
  role: "agent" | "user";
  content: string;
}

interface AgentContext {
  inviteeName: string;
  eventName: string;
  eventDate: Date;
  eventLocation: string;
  campaignName: string;
}

const LANGUAGE_RULE: Record<Lang, string> = {
  "en-IN": "LANGUAGE: Speak in English.",
  "hi-IN":
    "LANGUAGE: Speak ONLY in Hindi, written in Devanagari script. Do not use English words or Roman letters (except the token [END]).",
  "gu-IN":
    "LANGUAGE: Speak ONLY in Gujarati, written in Gujarati script. Do not use English words or Roman letters (except the token [END]).",
};

export function buildSystemPrompt(
  c: AgentContext,
  lang: Lang,
  wrapUp = false
): string {
  const date = c.eventDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `You are a friendly phone agent for GlobalVox calling ${c.inviteeName} to collect an RSVP.
Event: ${c.eventName}, ${date}, ${c.eventLocation}. The greeting and the attendance question were already asked.
Speak 1 or 2 short sentences, no lists or emojis. Ask one question at a time. Never invent event details; if asked something unknown, say the team will follow up.
Flow: if the answer is unclear, ask once more whether they can attend. If attending, ask how many guests they are bringing. If unsure, ask when they can let you know. If declining, ask nothing more. Then close: thank them, say goodbye, and end with [END]. Never put [END] in a reply that contains a question.${
    wrapUp ? "\nNow skip any questions: thank them, say goodbye and end with [END]." : ""
  }
${LANGUAGE_RULE[lang]}`;
}

export function openingLine(c: AgentContext, lang: Lang): string {
  return voiceLines(lang).opening({
    name: c.inviteeName,
    event: c.eventName,
    date: c.eventDate,
    location: c.eventLocation,
  });
}

export function toChatMessages(
  system: string,
  transcript: TranscriptTurn[]
): ChatMessage[] {
  return [
    { role: "system", content: system },
    ...transcript.map<ChatMessage>((t) => ({
      role: t.role === "agent" ? "assistant" : "user",
      content: t.content,
    })),
  ];
}

export interface RsvpResult {
  outcome: Extract<CallOutcome, "CONFIRMED" | "DECLINED" | "UNDECIDED" | "NO_ANSWER">;
  summary: string;
}

const RSVP_SCHEMA = {
  type: "object",
  properties: {
    outcome: {
      type: "string",
      enum: ["CONFIRMED", "DECLINED", "UNDECIDED"],
    },
    summary: { type: "string" },
  },
  required: ["outcome", "summary"],
};

export async function classifyRsvp(
  transcript: TranscriptTurn[]
): Promise<RsvpResult> {
  const userSpoke = transcript.some(
    (t) => t.role === "user" && t.content.trim().length > 0
  );
  if (!userSpoke) {
    return { outcome: "NO_ANSWER", summary: "The invitee did not speak during the call." };
  }

  const text = transcript
    .map((t) => `${t.role === "agent" ? "Agent" : "Invitee"}: ${t.content}`)
    .join("\n");

  const result = await chatJson<{ outcome: RsvpResult["outcome"]; summary: string }>(
    [
      {
        role: "user",
        content: `Below is a phone call transcript where an agent asks an invitee to RSVP to an event.
Decide the invitee's final answer: CONFIRMED (will attend), DECLINED (will not attend), or UNDECIDED (unsure, wants to decide later, or gave no clear answer).
Also write a one-sentence English summary that includes any useful detail (guests, when they will confirm, reasons).

Transcript:
${text}`,
      },
    ],
    RSVP_SCHEMA
  );

  return {
    outcome: result.outcome,
    summary: (result.summary ?? "").slice(0, 300),
  };
}
