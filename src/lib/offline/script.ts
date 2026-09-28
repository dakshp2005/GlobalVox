// The scripted RSVP conversation used by the Lite mode.
// Pure functions (no UI, no network) so it is trivial to test and to reuse on any platform.
//
// - Every step validates the answer. Anything that is not a real answer to the question that
//   was asked is "unclear": the agent re-asks (with a hint) up to MAX_REASKS times and then
//   ends safely instead of storing junk.
// - Follow-up questions ("what's the timing?", "where's the venue?") are answered on the
//   device at any point; the agent then re-asks the question it was on.
// - After the RSVP is captured the agent asks "Do you have any questions?" and only says
//   goodbye once the invitee has none.

import { voiceLines, type Lang } from "@/lib/voiceLines";
import {
  classifyAnswer,
  extractGuests,
  looksLikeTimeframe,
  noMoreQuestions,
} from "@/lib/offline/intent";
import {
  EMPTY_FACTS,
  answerQuestion,
  detectQuestion,
  type EventFacts,
  type FaqEntry,
  type Question,
} from "@/lib/offline/faq";

export type Step = "attend" | "guests" | "when" | "questions" | "done";
export type RsvpAnswer = "YES" | "NO" | "MAYBE";

export interface ScriptState {
  step: Step;
  answer: RsvpAnswer | null;
  /** Unclear answers given to the *current* question (resets on every new question). */
  unclear: number;
  guests: number | null;
  when: string | null;
  /** Follow-up questions answered in the closing round. */
  qCount: number;
  /** Topics the invitee asked about (for the team's summary). */
  asked: string[];
  /** Questions the device could not answer, for the team to follow up. */
  unanswered: string[];
  /** The last thing the agent said (used for "can you repeat that?"). */
  lastSay: string;
}

/** How many times a question is repeated before the call ends safely. */
export const MAX_REASKS = 2;
/** How many follow-up questions are answered in the closing round before wrapping up. */
export const MAX_QUESTIONS = 4;

/** What the invitee's reply means for the question that was asked. */
export type Interpretation =
  | { kind: "answer"; answer: RsvpAnswer }
  | { kind: "guests"; guests: number }
  | { kind: "when"; text: string }
  /** A follow-up question, optionally together with a valid answer ("yes, where is it?"). */
  | { kind: "question"; question: Question; with?: Interpretation }
  /** "No (more) questions". */
  | { kind: "none" }
  | { kind: "unclear" };

export function initialState(): ScriptState {
  return {
    step: "attend",
    answer: null,
    unclear: 0,
    guests: null,
    when: null,
    qCount: 0,
    asked: [],
    unanswered: [],
    lastSay: "",
  };
}

/** Rule-based reading of a reply as an answer to the current question (no follow-up questions). */
function interpretAnswer(step: Step, text: string): Interpretation {
  switch (step) {
    case "attend": {
      const a = classifyAnswer(text);
      return a === "UNKNOWN" ? { kind: "unclear" } : { kind: "answer", answer: a };
    }
    case "guests": {
      const g = extractGuests(text);
      if (g !== null) return { kind: "guests", guests: g };
      if (classifyAnswer(text) === "NO") return { kind: "guests", guests: 0 };
      return { kind: "unclear" };
    }
    case "when":
      return looksLikeTimeframe(text) ? { kind: "when", text: text.trim() } : { kind: "unclear" };
    default:
      return { kind: "unclear" };
  }
}

/** Rule-based understanding of a reply, for the given step. Fast and fully local. */
export function interpret(step: Step, text: string, faq: FaqEntry[] = []): Interpretation {
  if (step === "done") return { kind: "unclear" };
  const q = detectQuestion(text, faq);

  if (step === "questions") {
    if (q) return { kind: "question", question: q };
    if (noMoreQuestions(text)) return { kind: "none" };
    if (classifyAnswer(text) === "YES") return { kind: "answer", answer: "YES" };
    return { kind: "unclear" };
  }

  const base = interpretAnswer(step, text);
  // A recognised question wins, but a valid answer given in the same breath is kept.
  if (q && q.strong) {
    return { kind: "question", question: q, ...(base.kind !== "unclear" ? { with: base } : {}) };
  }
  if (base.kind !== "unclear") return base;
  if (q) return { kind: "question", question: q };
  return base;
}

export interface Advance {
  state: ScriptState;
  say: string;
  end: boolean;
  /** True when the same question is being asked again because the reply was unclear. */
  reask: boolean;
}

function noteQuestion(state: ScriptState, q: Question, answered: boolean) {
  if (q.label !== "other question" && !state.asked.includes(q.label)) state.asked.push(q.label);
  if (!answered && state.unanswered.length < 3) {
    state.unanswered.push(q.text.replace(/\s+/g, " ").slice(0, 100));
  }
}

/** Feeds one understood reply into the script and returns the next state and what to say. */
export function advance(
  state: ScriptState,
  interp: Interpretation,
  lang: Lang,
  facts: EventFacts = EMPTY_FACTS
): Advance {
  const lines = voiceLines(lang);
  const next: ScriptState = {
    ...state,
    asked: [...state.asked],
    unanswered: [...state.unanswered],
  };

  const finalGoodbye = () =>
    state.answer === "YES"
      ? lines.closeYes
      : state.answer === "NO"
        ? lines.closeNo
        : state.answer === "MAYBE"
          ? lines.closeMaybe
          : lines.goodbye;

  const out = (say: string, opts: { end?: boolean; reask?: boolean; step?: Step } = {}): Advance => {
    if (opts.step) {
      next.step = opts.step;
      next.unclear = 0;
    }
    next.lastSay = say;
    return { state: next, say, end: opts.end ?? false, reask: opts.reask ?? false };
  };

  if (state.step === "done") return { state, say: lines.goodbye, end: true, reask: false };

  // ---- a follow-up question, at any point of the call
  if (interp.kind === "question") {
    const q = interp.question;
    const qa = answerQuestion(q, facts, lang, state.lastSay);
    if (q.topic === "repeat") return out(qa.say);
    noteQuestion(next, q, qa.answered);

    if (state.step === "questions") {
      next.qCount = state.qCount + 1;
      next.unclear = 0;
      if (next.qCount >= MAX_QUESTIONS) {
        return out(`${qa.say} ${finalGoodbye()}`, { end: true, step: "done" });
      }
      return out(`${qa.say} ${lines.moreQuestions}`);
    }

    if (interp.with) {
      // The invitee also answered: apply that, and put the answer to their question first.
      const inner = advance(next, interp.with, lang, facts);
      const say = `${qa.say} ${inner.say}`;
      inner.state.lastSay = say;
      return { ...inner, say };
    }
    const requestion =
      state.step === "guests" ? lines.askGuests : state.step === "when" ? lines.askWhen : lines.askAttend;
    return out(`${qa.say} ${requestion}`);
  }

  // ---- the closing round: "Do you have any questions?"
  if (state.step === "questions") {
    if (interp.kind === "none") return out(finalGoodbye(), { end: true, step: "done" });
    next.unclear = state.unclear + 1;
    if (next.unclear > MAX_REASKS) return out(finalGoodbye(), { end: true, step: "done" });
    if (interp.kind === "answer" && interp.answer === "YES") return out(lines.goAhead);
    return out(lines.retryQuestions, { reask: true });
  }

  // ---- the RSVP questions
  const valid =
    (state.step === "attend" && interp.kind === "answer") ||
    (state.step === "guests" && interp.kind === "guests") ||
    (state.step === "when" && interp.kind === "when");

  if (!valid) {
    next.unclear = state.unclear + 1;
    if (next.unclear <= MAX_REASKS) {
      const say =
        state.step === "guests"
          ? lines.retryGuests
          : state.step === "when"
            ? lines.retryWhen
            : lines.retryAttend;
      return out(say, { reask: true });
    }
    // Out of patience: move on safely without inventing an answer.
    if (state.step === "guests") {
      next.answer = "YES";
      return out(`${lines.ackYes} ${lines.askQuestions}`, { step: "questions" });
    }
    if (state.step === "when") {
      next.answer = "MAYBE";
      return out(`${lines.ackMaybe} ${lines.askQuestions}`, { step: "questions" });
    }
    return out(lines.closeUnclear, { end: true, step: "done" });
  }

  if (state.step === "attend" && interp.kind === "answer") {
    next.answer = interp.answer;
    if (interp.answer === "YES") return out(lines.askGuests, { step: "guests" });
    if (interp.answer === "MAYBE") return out(lines.askWhen, { step: "when" });
    return out(`${lines.ackNo} ${lines.askQuestions}`, { step: "questions" });
  }
  if (state.step === "guests" && interp.kind === "guests") {
    next.guests = interp.guests;
    return out(`${lines.ackYes} ${lines.askQuestions}`, { step: "questions" });
  }
  if (state.step === "when" && interp.kind === "when") {
    next.when = interp.text;
    return out(`${lines.ackMaybe} ${lines.askQuestions}`, { step: "questions" });
  }
  return { state, say: lines.goodbye, end: true, reask: false };
}

export type ScriptOutcome = "CONFIRMED" | "DECLINED" | "UNDECIDED";

/** Final result of a finished script, with an English summary for the team. */
export function scriptResult(state: ScriptState): { outcome: ScriptOutcome; summary: string } {
  let outcome: ScriptOutcome;
  let summary: string;
  if (state.answer === "YES") {
    const g =
      state.guests === null
        ? "guest count not captured"
        : state.guests === 0
          ? "coming alone"
          : `bringing ${state.guests} guest${state.guests === 1 ? "" : "s"}`;
    outcome = "CONFIRMED";
    summary = `Confirmed attendance (${g}).`;
  } else if (state.answer === "NO") {
    outcome = "DECLINED";
    summary = "Declined the invitation.";
  } else if (state.answer === "MAYBE") {
    outcome = "UNDECIDED";
    summary = state.when
      ? `Unsure; said about when they can confirm: "${state.when}".`
      : "Unsure about attending; no date given.";
  } else {
    outcome = "UNDECIDED";
    summary = "Answer was unclear even after re-asking.";
  }
  const extras = [
    state.asked.length ? `Asked about: ${state.asked.join(", ")}.` : "",
    state.unanswered.length
      ? `Questions for the team to follow up: ${state.unanswered.map((q) => `"${q}"`).join("; ")}.`
      : "",
  ].filter(Boolean);
  return { outcome, summary: [summary, ...extras].join(" ") };
}
