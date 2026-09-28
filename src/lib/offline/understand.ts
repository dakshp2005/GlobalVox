"use client";

// Understanding of one reply: rules first (instant), then the small local model
// (a second opinion, only for what the rules can't place). If the model is unavailable the call keeps
// working with rules only and simply re-asks unclear answers.

import type { Lang } from "@/lib/voiceLines";
import { interpret, type Interpretation, type Step } from "@/lib/offline/script";
import type { FaqEntry } from "@/lib/offline/faq";

export type UnderstoodBy = "rules" | "model" | "none";

export interface Understanding {
  interp: Interpretation;
  by: UnderstoodBy;
  ms: number;
}

const MODEL_TIMEOUT_MS = 15_000; // a 4B model needs a few seconds on a CPU-only laptop
const RETRY_AFTER_MS = 30_000;
let modelDownUntil = 0;

/** Loads the small model in the background at the start of a call. Never throws. */
export function warmSmallModel() {
  fetch("/api/voice/classify").catch(() => undefined);
}

export async function understand(
  step: Step,
  text: string,
  lang: Lang,
  faq: FaqEntry[] = []
): Promise<Understanding> {
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);

  // Rules include follow-up questions (timing, venue, the team's own notes), so a question
  // never waits for the model.
  const rules = interpret(step, text, faq);
  if (rules.kind !== "unclear" || step === "done" || step === "questions") {
    return { interp: rules, by: "rules", ms: elapsed() };
  }
  if (Date.now() < modelDownUntil) return { interp: rules, by: "none", ms: elapsed() };

  try {
    const res = await fetch("/api/voice/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, text, lang }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`classify ${res.status}`);
    const { label, count } = (await res.json()) as { label?: string; count?: number };

    let interp: Interpretation = { kind: "unclear" };
    if (step === "attend" && (label === "YES" || label === "NO" || label === "MAYBE")) {
      interp = { kind: "answer", answer: label };
    } else if (step === "guests" && label === "NUMBER" && typeof count === "number") {
      interp = { kind: "guests", guests: count };
    } else if (step === "guests" && label === "NONE") {
      interp = { kind: "guests", guests: 0 };
    } else if (step === "when" && label === "TIMEFRAME") {
      interp = { kind: "when", text: text.trim() };
    }
    return { interp, by: "model", ms: elapsed() };
  } catch {
    modelDownUntil = Date.now() + RETRY_AFTER_MS; // don't slow every turn while it is down
    return { interp: rules, by: "none", ms: elapsed() };
  }
}
