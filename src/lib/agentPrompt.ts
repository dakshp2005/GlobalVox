// The voice agent's instructions. The team edits the "persona" part per campaign from the
// campaign form; the call mechanics (event facts, language, how to end the call) are always
// added by the server so an edited prompt can't break a call. Safe to import in the browser.

export type AgentVoice = "female" | "male";

export const AGENT_VOICES: { id: AgentVoice; label: string }[] = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

export function isAgentVoice(v: unknown): v is AgentVoice {
  return v === "female" || v === "male";
}

export const AGENT_PROMPT_MAX = 4000;

/** Placeholders the team can use in the instructions; filled in for every call. */
export const PROMPT_PLACEHOLDERS = [
  { key: "invitee_name", label: "Invitee name" },
  { key: "event_name", label: "Event name" },
  { key: "event_date", label: "Event date" },
  { key: "event_time", label: "Start time" },
  { key: "event_location", label: "Location" },
  { key: "campaign_name", label: "Campaign name" },
] as const;

export type PlaceholderKey = (typeof PROMPT_PLACEHOLDERS)[number]["key"];

// Kept short on purpose. The local model (gemma3 on Ollama) can only reuse its work from the
// previous turn while the whole prompt stays under roughly 500 tokens; past that it re-reads
// everything on every turn, which on a laptop CPU means 15+ seconds before each reply.
export const DEFAULT_AGENT_PROMPT = `You're a friendly event coordinator from GlobalVox, phoning {{invitee_name}} about {{event_name}}. Sound like a real person: warm, casual, brief. React to what they say in your own words.

Find out if they're coming; if yes, how many people come with them; if unsure, when to check back. Then ask if they have questions. Skip anything they've already told you.

- Talk like a phone call, not an email: contractions, short phrases, a quick natural reaction first. Don't repeat back what they said and don't thank them every turn.
- Go by meaning: "Can I bring my wife?" means yes, 1 guest. "I'll try" means unsure.
- Busy or "call later": ask what time suits them, or repeat the time they give. Don't suggest one. Then say goodbye.
- Off-topic questions: answer briefly like a person would, then get back to the invite.
- Asked if you're a robot: say you're GlobalVox's AI assistant.
- Unknown details: the team will follow up. Never make things up.`;

export interface PromptContext {
  inviteeName: string;
  eventName: string;
  eventDate: Date;
  eventLocation: string;
  campaignName: string;
  eventTime?: string | null;
  venueDetails?: string | null;
  faqNotes?: string | null;
}

export function formatEventDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC", // event dates are stored as midnight UTC of the chosen day
  });
}

/** Fills {{placeholders}}; unknown ones are left as typed so the team can spot the typo. */
export function renderAgentPrompt(template: string, c: PromptContext): string {
  const values: Record<PlaceholderKey, string> = {
    invitee_name: c.inviteeName,
    event_name: c.eventName,
    event_date: formatEventDate(c.eventDate),
    event_time: c.eventTime || "not announced yet",
    event_location: c.eventLocation,
    campaign_name: c.campaignName,
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) =>
    key.toLowerCase() in values ? values[key.toLowerCase() as PlaceholderKey] : whole
  );
}

/**
 * Cleans the agent settings of a campaign request body. Absent fields are left out (so a
 * PATCH doesn't wipe them); a prompt identical to the default is stored as null, so later
 * improvements to the default reach campaigns that never customised it.
 */
export function cleanAgentSettings(
  body: Record<string, unknown>
):
  | { ok: true; data: { agentPrompt?: string | null; agentVoice?: AgentVoice | null } }
  | { ok: false; error: string } {
  const data: { agentPrompt?: string | null; agentVoice?: AgentVoice | null } = {};
  if (body.agentPrompt !== undefined) {
    if (body.agentPrompt !== null && typeof body.agentPrompt !== "string") {
      return { ok: false, error: "agentPrompt must be text" };
    }
    const value = (body.agentPrompt ?? "").replace(/\r\n/g, "\n").trim();
    if (value.length > AGENT_PROMPT_MAX) {
      return { ok: false, error: `Agent instructions are too long (max ${AGENT_PROMPT_MAX} characters)` };
    }
    data.agentPrompt = value === "" || value === DEFAULT_AGENT_PROMPT ? null : value;
  }
  if (body.agentVoice !== undefined) {
    if (body.agentVoice !== null && !isAgentVoice(body.agentVoice)) {
      return { ok: false, error: "agentVoice must be female or male" };
    }
    data.agentVoice = body.agentVoice ?? null;
  }
  return { ok: true, data };
}
