import { NextResponse } from "next/server";
import { OLLAMA_CLASSIFY_MODEL, OllamaError, generateWord, warmUp } from "@/lib/ollama";
import { classifyAnswer } from "@/lib/offline/intent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Step = "attend" | "guests" | "when";

// Compact few-shot prompts: on a CPU, prompt length is what costs time. The "UNCLEAR" examples
// matter most: small models otherwise happily turn random text into an answer.
const PROMPTS: Record<Step, string> = {
  attend:
    'RSVP phone call. Question: "Will you attend?" Answer one word: YES, NO, MAYBE or UNCLEAR (random letters, unrelated, a question, or unsure).\n' +
    '"count me in" -> YES\n"sorry, I have a clash" -> NO\n"not sure yet" -> MAYBE\n"asdf" -> UNCLEAR\n"what time" -> UNCLEAR\n"{t}" ->',
  guests:
    'RSVP phone call. Question: "How many guests will you bring?" Answer one word: a digit, NONE (alone), or UNCLEAR (random letters, unrelated, no number).\n' +
    '"two friends" -> 2\n"just me" -> NONE\n"my wife and I" -> 1\n"asdf" -> UNCLEAR\n"I like tea" -> UNCLEAR\n"{t}" ->',
  when:
    'RSVP phone call. Question: "By when can you let us know?" Answer one word: TIME (they named a day, date or period) or UNCLEAR (random letters, unrelated, no time).\n' +
    '"next week" -> TIME\n"after the festival" -> TIME\n"the cat is hungry" -> UNCLEAR\n"asdf" -> UNCLEAR\n"{t}" ->',
};

type Label = "YES" | "NO" | "MAYBE" | "NUMBER" | "NONE" | "TIMEFRAME" | "UNCLEAR";

/** Maps the model's one-word reply to a label, defaulting to UNCLEAR for anything unexpected. */
function parse(step: Step, raw: string): { label: Label; count?: number } {
  const word = raw.replace(/["'.,!]/g, "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (step === "attend") {
    return { label: (["YES", "NO", "MAYBE"].includes(word) ? word : "UNCLEAR") as Label };
  }
  if (step === "guests") {
    if (word === "NONE") return { label: "NONE" };
    if (/^\d{1,2}$/.test(word) && Number(word) <= 50) return { label: "NUMBER", count: Number(word) };
    return { label: "UNCLEAR" };
  }
  return { label: word === "TIME" ? "TIMEFRAME" : "UNCLEAR" };
}

/** POST { step, text, lang } -> { label, count? }: a second opinion for answers the rules can't place. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    step?: string;
    text?: string;
  } | null;
  const step = body?.step as Step | undefined;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 200) : "";
  if (!step || !(step in PROMPTS) || !text) {
    return NextResponse.json({ error: "step and text are required" }, { status: 400 });
  }

  try {
    // Quotes would break the few-shot format (and could smuggle in instructions).
    const safe = text.replace(/["\n\r]/g, " ");
    const raw = await generateWord(PROMPTS[step].replace("{t}", safe), {
      model: OLLAMA_CLASSIFY_MODEL,
      numPredict: 4,
      timeoutMs: 20_000,
    });
    let out = parse(step, raw);

    // Guard rail: a plain "yes"/"no" is never a guest count or a date, whatever the model says.
    const plain = classifyAnswer(text);
    if (step === "when" && (plain === "YES" || plain === "NO")) out = { label: "UNCLEAR" };
    if (step === "guests" && plain === "YES") out = { label: "UNCLEAR" };

    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof OllamaError ? e.message : "The classification model failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** GET -> loads the model into memory so the first real answer isn't slow. */
export async function GET() {
  await warmUp(OLLAMA_CLASSIFY_MODEL);
  return NextResponse.json({ ok: true, model: OLLAMA_CLASSIFY_MODEL });
}
