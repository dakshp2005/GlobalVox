import type { CallOutcome } from "@prisma/client";
import { chatJson } from "@/lib/ollama";
import { voiceLines, type Lang } from "@/lib/voiceLines";
import {
  DEFAULT_AGENT_PROMPT,
  formatEventDate,
  renderAgentPrompt,
  type AgentVoice,
  type PromptContext,
} from "@/lib/agentPrompt";

export interface TranscriptTurn {
  role: "agent" | "user";
  content: string;
}

export const TIME_ZONE = "Asia/Kolkata";

/** "Wednesday, 30 September 2026, 3:40 pm" in India time. */
function indiaDateTime(d: Date) {
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  });
}

function indiaDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  });
}

// How to sound natural in each language. Formal, textbook Hindi and Gujarati is the biggest
// giveaway of a machine: real callers mix in everyday English words.
const LANGUAGE_STYLE: Record<Lang, (g: AgentVoice) => string> = {
  "en-IN": () => "friendly Indian English",
  "hi-IN": (g) =>
    `everyday spoken Hindi, the way people really talk on the phone: say आप (never तुम), use everyday English words like इवेंट, गेस्ट, टाइम, ओके, avoid bookish words ("प्रोग्राम" not "कार्यक्रम", "सवाल" not "प्रश्न"), and write everything in Devanagari, English words included, because a Hindi voice reads it aloud. You're a ${
      g === "female" ? 'woman ("मैं बोल रही हूँ")' : 'man ("मैं बोल रहा हूँ")'
    }`,
  "gu-IN": (g) =>
    `everyday spoken Gujarati, the way people really talk on the phone: say તમે, use everyday English words like ઇવેન્ટ, ગેસ્ટ, ટાઇમ, ઓકે, avoid bookish words ("પ્રોગ્રામ" not "કાર્યક્રમ", "સવાલ" not "પ્રશ્ન"), and write everything in Gujarati script, English words included, because a Gujarati voice reads it aloud. You're a ${
      g === "female" ? 'woman ("હું બોલી રહી છું")' : 'man ("હું બોલી રહ્યો છું")'
    }`,
};

export interface SystemPromptOptions {
  /** The language the call started in. */
  lang: Lang;
  gender: AgentVoice;
  /** The campaign's custom instructions; null/empty = the default. */
  template?: string | null;
  now?: Date;
}

/**
 * The editable instructions (with placeholders filled in), followed by the parts the
 * server always controls: event facts and call rules. The local voice server uses it as
 * the model's instructions for the whole call; when the caller switches language, the
 * voice server tells the model on that message.
 *
 * Whatever changes from call to call (the guest's name, today's date) goes last: the local
 * model keeps the text it has already read, so every call of a campaign after the first
 * skips re-reading the shared part (~30 s on a laptop CPU).
 */
export function buildSystemPrompt(c: PromptContext, o: SystemPromptOptions): string {
  const instructions = renderAgentPrompt(o.template?.trim() || DEFAULT_AGENT_PROMPT, {
    ...c,
    inviteeName: "the guest",
  });
  const facts = [
    `${c.eventName}, ${formatEventDate(c.eventDate)}, ${c.eventLocation}`,
    `Starts: ${c.eventTime || "time not announced yet"}`,
    c.venueDetails && `Venue: ${c.venueDetails}`,
    ...(c.faqNotes ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  ].filter(Boolean);

  return `${instructions}

Facts (all you know):
${facts.map((f) => `- ${f}`).join("\n")}

Rules: Reply in one or two short spoken sentences, one question at a time, no emojis, lists or brackets. They've already heard you say "okay" before each reply, so never open with "Okay", "Great", "Sure" or "Got it"; keep your first sentence to a few words. Their words come from speech recognition; if a few words are garbled, guess the meaning from context or ask about that one thing, never say you don't understand. You speak English, Hindi and Gujarati fluently: follow whichever they use, never ask them to switch language and never add translations. Speak ${LANGUAGE_STYLE[o.lang](o.gender)}. Keep the call moving: after answering them, ask the next thing you still need. Only when they have nothing more to ask, say goodbye and put [END] after it; [END] never goes anywhere else.

Today is ${indiaDate(o.now ?? new Date())}. The guest is ${c.inviteeName}; you've greeted them and asked if they can come.`;
}

export function openingLine(c: PromptContext, lang: Lang, gender: AgentVoice): string {
  return voiceLines(lang, gender).opening({
    name: c.inviteeName,
    event: c.eventName,
    date: c.eventDate,
    location: c.eventLocation,
  });
}

export interface RsvpResult {
  outcome: Extract<
    CallOutcome,
    "CONFIRMED" | "DECLINED" | "UNDECIDED" | "CALLBACK_REQUESTED" | "NO_ANSWER"
  >;
  summary: string;
  /** When the invitee asked to be called back (only with CALLBACK_REQUESTED). */
  callbackAt: Date | null;
}

// Fields are generated in this order: writing the summary and the "call me later" flag
// first gives the small model a moment to think before it picks the outcome.
const RSVP_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    asked_to_call_later: { type: "boolean" },
    outcome: {
      type: "string",
      enum: ["CONFIRMED", "DECLINED", "UNDECIDED", "CALLBACK_REQUESTED"],
    },
    callback_time: { type: "string" },
  },
  required: ["summary", "asked_to_call_later", "outcome", "callback_time"],
};

/** Words that usually mean "not now, call me later", in English, Hindi and Gujarati. */
const CALL_LATER =
  /\b(call (me )?(back|later|again|after|tomorrow|in)|busy|in a meeting|driving|not a good time|talk later|baad me(in)?|abhi busy|phir (se )?(call|phone)|kal (call|phone))\b|बाद में|बिज़ी|बिजी|व्यस्त|फिर से कॉल|પછી ફોન|પછી વાત|બીઝી|બિઝી|કામમાં/i;

/** When a callback was asked for without a usable time, try again in a couple of hours. */
const DEFAULT_CALLBACK_MS = 2 * 3600 * 1000;
const MAX_CALLBACK_MS = 60 * 24 * 3600 * 1000;

/** Parses the model's "YYYY-MM-DD HH:mm" (India time) into a Date, if sensible. */
export function parseCallbackTime(value: string, now = new Date()): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const at = new Date(`${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi}:00+05:30`);
  if (isNaN(at.getTime())) return null;
  const ahead = at.getTime() - now.getTime();
  // A time a few minutes in the past is "call me now-ish"; anything else odd is ignored.
  if (ahead < -10 * 60 * 1000 || ahead > MAX_CALLBACK_MS) return null;
  return ahead < 0 ? now : at;
}

export async function classifyRsvp(
  transcript: TranscriptTurn[],
  now = new Date()
): Promise<RsvpResult> {
  const userSpoke = transcript.some(
    (t) => t.role === "user" && t.content.trim().length > 0
  );
  if (!userSpoke) {
    return {
      outcome: "NO_ANSWER",
      summary: "The invitee did not speak during the call.",
      callbackAt: null,
    };
  }

  const text = transcript
    .map(
      (t) =>
        `${t.role === "agent" ? "Agent" : "Invitee"}: ${t.content.replace(/\[END\]|\s*—\s*$/g, "").trim()}`
    )
    .join("\n");
  const saidCallLater = transcript.some((t) => t.role === "user" && CALL_LATER.test(t.content));
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);

  const result = await chatJson<{
    summary: string;
    asked_to_call_later?: boolean;
    outcome: RsvpResult["outcome"];
    callback_time?: string;
  }>(
    [
      {
        role: "user",
        content: `Below is a phone call transcript (it may be in English, Hindi or Gujarati) where an agent asks an invitee to RSVP to an event.
The call took place on ${indiaDateTime(now)}, India time. Tomorrow is ${indiaDate(tomorrow)}.

summary: one English sentence with the useful details: the answer, how many people are coming with them and who, when to call back, reasons and any questions for the team.

asked_to_call_later: true if the invitee said they're busy or asked to be called back later.

outcome, the invitee's final answer:
- CONFIRMED: will attend (asking to bring someone, like a spouse or child, also means yes).
- DECLINED: will not attend.
- UNDECIDED: unsure, will decide later, or no clear answer.
- CALLBACK_REQUESTED: they asked to be called back later instead of giving an answer. If they also clearly said yes, no or maybe, use that instead.

callback_time: for CALLBACK_REQUESTED, the time they asked to be called, as "YYYY-MM-DD HH:mm" in India time. Use the time the invitee said, not one the agent suggested. Work out words like "after 5" (17:00 today if that's still ahead, else tomorrow), "tomorrow morning", "kal shaam"; morning = 10:00, afternoon = 14:00, evening = 18:00, "in an hour" = one hour after the call. Otherwise "".
${saidCallLater ? '\nNote: the invitee used words like "busy" or "call me later".\n' : ""}
Transcript:
${text}`,
      },
    ],
    RSVP_SCHEMA
  );

  // The model sometimes flags a callback request yet files it as undecided.
  const outcome: RsvpResult["outcome"] =
    result.outcome === "UNDECIDED" && result.asked_to_call_later && saidCallLater
      ? "CALLBACK_REQUESTED"
      : result.outcome;

  let callbackAt: Date | null = null;
  if (outcome === "CALLBACK_REQUESTED") {
    callbackAt =
      parseCallbackTime(result.callback_time ?? "", now) ??
      new Date(now.getTime() + DEFAULT_CALLBACK_MS);
  }

  return {
    outcome,
    summary: (result.summary ?? "").slice(0, 300),
    callbackAt,
  };
}
