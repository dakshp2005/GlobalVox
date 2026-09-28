// On-device answers to an invitee's follow-up questions ("what's the timing?", "where's the
// venue?", "is there parking?"). No model and no network: keyword rules in English, Hindi
// (Devanagari and Roman) and Gujarati, answering from the campaign's own details.

import { normalize, tokens } from "@/lib/offline/intent";
import { voiceLines, type Lang } from "@/lib/voiceLines";

export type Topic = "time" | "date" | "venue" | "repeat" | "faq" | "other";

export interface FaqEntry {
  topic: string;
  answer: string;
  keys: string[];
}

export interface EventFacts {
  eventDate: Date;
  location: string;
  eventTime?: string | null;
  venueDetails?: string | null;
  faq: FaqEntry[];
}

export interface Question {
  topic: Topic;
  /** Strong = a recognised question about something we know or can say; weak = some other question. */
  strong: boolean;
  /** Short label for the team's summary ("timings", "venue", "parking"...). */
  label: string;
  /** What the invitee said (kept for the "unanswered questions" list). */
  text: string;
  faq?: FaqEntry;
}

export const EMPTY_FACTS: EventFacts = { eventDate: new Date(0), location: "", faq: [] };

// ---------------------------------------------------------------- word helpers

const norm = (list: string[]) => list.map((p) => tokens(p)).filter((p) => p.length);

function hasPhrase(toks: string[], phrases: string[][]): boolean {
  return phrases.some(
    (p) => p.length <= toks.length && toks.some((_, i) => p.every((w, k) => toks[i + k] === w))
  );
}

const set = (list: string[]) => new Set(list.map(normalize));

// ---------------------------------------------------------------- team-written facts

/** Groups of words that mean the same thing, so "where can I park?" finds "Parking: ...". */
const SYNONYMS: Record<string, string[]> = {
  parking: ["parking", "park", "vehicle", "car", "gaadi", "gadi", "पार्किंग", "गाड़ी", "गाडी", "पार्क", "પાર્કિંગ", "ગાડી"],
  dress: ["dress", "attire", "wear", "clothes", "clothing", "code", "formal", "casual", "ड्रेस", "कपड़े", "कपडे", "पहनावा", "ડ્રેસ", "પહેરવેશ", "કપડાં"],
  food: ["food", "lunch", "dinner", "breakfast", "meal", "meals", "eat", "menu", "snacks", "refreshments", "veg", "खाना", "भोजन", "नाश्ता", "ભોજન", "જમવાનું", "ખાવાનું", "નાસ્તો"],
  fee: ["fee", "fees", "cost", "price", "ticket", "charge", "charges", "paid", "free", "payment", "फीस", "शुल्क", "कीमत", "मुफ्त", "फ्री", "ફી", "કિંમત", "મફત"],
  contact: ["contact", "phone", "number", "call", "reach", "email", "संपर्क", "फोन", "नंबर", "ઈમેલ", "સંપર્ક", "ફોન", "નંબર"],
  stay: ["hotel", "stay", "accommodation", "room", "lodging", "होटल", "रुकना", "ठहरना", "હોટેલ", "રહેવા"],
  agenda: ["agenda", "program", "programme", "session", "sessions", "speaker", "speakers", "itinerary", "एजेंडा", "एजेन्डा", "એજન્ડા"],
  travel: ["travel", "transport", "cab", "pickup", "drop", "shuttle", "bus", "train", "flight", "यात्रा", "પ્રવાસ"],
  family: ["kids", "children", "child", "family", "spouse", "wife", "husband", "बच्चे", "परिवार", "पत्नी", "पति", "બાળકો", "પરિવાર", "પત્ની", "પતિ"],
  gift: ["gift", "gifts", "giveaway", "goodies", "swag", "गिफ्ट", "उपहार", "ભેટ"],
  duration: ["duration", "long", "ends", "finish", "अवधि", "अंत", "સમયગાળો"],
};
const SYN_LOOKUP = new Map<string, string>();
for (const [group, words] of Object.entries(SYNONYMS)) for (const w of words) SYN_LOOKUP.set(normalize(w), group);

const STOPWORDS = set([
  "the", "a", "an", "is", "are", "was", "will", "be", "there", "it", "this", "that", "what", "whats",
  "what's", "where", "when", "who", "how", "do", "does", "can", "i", "you", "we", "my", "your", "our",
  "event", "about", "tell", "me", "please", "for", "of", "to", "in", "on", "at", "and", "or", "any",
  "have", "has", "get", "give", "know", "want", "need", "there's", "any", "some",
  "kya", "hai", "hain", "ka", "ki", "ke", "ko", "me", "mein", "main", "aap", "क्या", "है", "हैं", "का",
  "की", "के", "को", "में", "मैं", "आप", "यह", "वह", "कार्यक्रम", "बताइए", "बताओ",
  "શું", "છે", "નો", "ની", "નું", "ના", "માં", "હું", "તમે", "આ", "તે", "કાર્યક્રમ",
]);

function keysOf(toks: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of toks) {
    if (STOPWORDS.has(raw)) continue;
    const t = raw.length > 4 && raw.endsWith("s") ? raw.slice(0, -1) : raw;
    const g = SYN_LOOKUP.get(t) ?? SYN_LOOKUP.get(raw);
    keys.add(g ? `g:${g}` : t);
  }
  return [...keys];
}

/** Parses the campaign's "Topic: answer" lines. Lines without a colon are ignored. */
export function parseFaqNotes(notes: string | null | undefined): FaqEntry[] {
  if (!notes) return [];
  const entries: FaqEntry[] = [];
  for (const line of notes.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const topic = line.slice(0, i).trim();
    const answer = line.slice(i + 1).trim();
    if (!topic || !answer) continue;
    const keys = keysOf(tokens(topic));
    if (keys.length) entries.push({ topic, answer, keys });
  }
  return entries;
}

// ---------------------------------------------------------------- question detection

const FILLERS = set(["hmm", "um", "uh", "er", "ah", "oh", "huh", "hello", "जी", "अरे", "હા જી"]);
const REPEAT_EXACT = set(["what", "sorry", "pardon", "huh", "come again", "क्या", "શું"]);
const REPEAT_PHRASES = norm([
  "repeat", "say that again", "say again", "once more", "one more time", "could you repeat",
  "can you repeat", "please repeat", "didn't hear", "didnt hear", "can't hear", "cannot hear",
  "दोबारा", "फिर से बोलिए", "फिर से कहिए", "एक बार फिर", "दोहराइए", "दोहराओ", "सुनाई नहीं",
  "ફરીથી", "ફરી કહો", "ફરી બોલો", "સંભળાયું નહીં",
  "dobara", "phir se bolo",
]);

/** Phrases that are questions on their own. */
const ASK = {
  time: norm([
    "what time", "which time", "at what time", "what's the time", "whats the time", "when does it start",
    "when will it start", "when does it begin", "when is it starting", "start time", "starting time",
    "kitne baje", "कितने बजे", "कब शुरू", "कब शुरू होगा", "टाइमिंग क्या", "समय क्या",
    "કેટલા વાગ્યે", "ક્યારે શરૂ", "સમય શું",
  ]),
  date: norm([
    "which date", "what date", "which day", "what day", "when is it", "when is the event", "when's the event",
    "when is the meet", "when is the meeting", "which day is it",
    "कौन सी तारीख", "कौन से दिन", "कब है", "कौन सा दिन", "तारीख क्या",
    "કઈ તારીખ", "ક્યારે છે", "કયા દિવસે", "તારીખ શું",
  ]),
  venue: norm([
    "where is", "where's", "wheres", "where will", "where exactly", "where is it", "where is the event",
    "how to reach", "how do i get there", "how can i reach",
    "kahan", "kaha hai", "कहाँ", "कहां", "कहाँ है", "कैसे पहुंचे",
    "ક્યાં", "ક્યાં છે", "કેવી રીતે પહોંચવું",
  ]),
};

/** Topic words that only count as a question when a question cue is present. */
const NOUNS = {
  time: set(["time", "timing", "timings", "समय", "टाइमिंग", "टाइम", "સમય", "ટાઈમિંગ"]),
  date: set(["date", "dates", "day", "तारीख", "तिथि", "दिन", "તારીખ", "દિવસ", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]),
  venue: set(["venue", "location", "address", "place", "directions", "landmark", "map", "स्थान", "जगह", "पता", "पते", "સ્થળ", "જગ્યા", "સરનામું", "સરનામુ"]),
};

/** Question cues (question words and requests). Modal verbs like "will" are not cues on their own. */
const CUE = set([
  "what", "whats", "what's", "where", "where's", "when", "which", "who", "how", "why",
  "क्या", "कहाँ", "कहां", "कब", "कौन", "कैसे", "क्यों", "बताइए", "बताओ", "बताएं", "कृपया",
  "શું", "ક્યાં", "ક્યારે", "કઈ", "કયા", "કોણ", "કેવી", "કેમ", "કહો", "જણાવો", "જણાવશો",
  "kya", "kahan", "kab", "kaun", "kaise", "batao", "bataiye",
]);

/** Question words: Latin ones must start the sentence; Hindi/Gujarati ones can be anywhere. */
const WH_LATIN = set(["what", "whats", "what's", "where", "where's", "when", "which", "who", "how", "why"]);
const WH_INDIC = set([
  "क्या", "कहाँ", "कहां", "कब", "कौन", "कैसे", "क्यों",
  "શું", "ક્યાં", "ક્યારે", "કઈ", "કયા", "કોણ", "કેવી", "કેમ",
  "kya", "kahan", "kab", "kaun", "kaise",
]);
/** "tell me the venue", "please tell": requests for information (the word "tell" alone is not one). */
const TELL_PHRASES = norm(["tell me", "please tell", "kindly tell", "can you tell", "could you tell", "let me know the"]);
const MODAL_FIRST = set(["can", "could", "may", "is", "are", "do", "does", "will", "would", "should"]);

function label(topic: Topic, faq?: FaqEntry): string {
  if (topic === "time") return "timings";
  if (topic === "date") return "date";
  if (topic === "venue") return "venue";
  if (topic === "faq") return (faq?.topic ?? "other").toLowerCase();
  return "other question";
}

/**
 * Recognises a follow-up question. Returns null when the text isn't a question.
 * Order: repeat request, the team's own facts, built-in topics (time / date / venue),
 * then any other question.
 */
export function detectQuestion(text: string, faq: FaqEntry[] = []): Question | null {
  const raw = text.trim();
  const toks = tokens(raw);
  if (!toks.length) return null;
  const q = (topic: Topic, strong: boolean, entry?: FaqEntry): Question => ({
    topic,
    strong,
    label: label(topic, entry),
    text: raw,
    faq: entry,
  });

  // "what?", "hmm what", "sorry?" on their own mean "I didn't hear, please say it again".
  const core = toks.filter((t) => !FILLERS.has(t));
  if (REPEAT_EXACT.has(core.join(" ")) || hasPhrase(toks, REPEAT_PHRASES)) return q("repeat", true);

  const mark = raw.includes("?");
  const wh = mark || toks.some((t) => CUE.has(t)) || hasPhrase(toks, TELL_PHRASES);
  // A sentence that *starts* with can/is/do/will... is a yes/no question ("is there parking").
  const anyCue = wh || MODAL_FIRST.has(toks[0]);

  // 1) Something the team wrote down (parking, dress code, food...).
  if (faq.length && (anyCue || toks.length <= 2)) {
    const keys = new Set(keysOf(toks));
    let best: FaqEntry | undefined;
    let bestScore = 0;
    for (const entry of faq) {
      const score = entry.keys.filter((k) => keys.has(k)).length;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    if (best) return q("faq", true, best);
  }

  // 2) Built-in topics.
  if (hasPhrase(toks, ASK.time)) return q("time", true);
  if (hasPhrase(toks, ASK.date)) return q("date", true);
  if (hasPhrase(toks, ASK.venue)) return q("venue", true);
  // A bare "timings" / "venue please" is a question too (not so for day names: "friday" is an answer).
  const short = toks.length <= 3;
  if ((wh || short) && toks.some((t) => NOUNS.time.has(t))) return q("time", true);
  if ((anyCue || short) && toks.some((t) => NOUNS.venue.has(t))) return q("venue", true);
  if (wh && toks.some((t) => NOUNS.date.has(t))) return q("date", true);

  // 3) Any other question.
  const startsWithWh = toks.slice(0, 3).some((t) => WH_LATIN.has(t));
  const indicWh = toks.some((t) => WH_INDIC.has(t));
  const modalQuestion = MODAL_FIRST.has(toks[0]) && toks.length >= 3;
  if (mark || startsWithWh || indicWh || modalQuestion) return q("other", false);
  return null;
}

// ---------------------------------------------------------------- answers

export interface QuestionAnswer {
  say: string;
  /** False when the device could not really answer (the team should follow up). */
  answered: boolean;
}

export function answerQuestion(
  question: Question,
  facts: EventFacts,
  lang: Lang,
  lastSay: string
): QuestionAnswer {
  const lines = voiceLines(lang);
  switch (question.topic) {
    case "repeat":
      return { say: lastSay || lines.askAttend, answered: true };
    case "time":
      return facts.eventTime
        ? { say: lines.infoTime(facts.eventTime), answered: true }
        : { say: lines.infoTimeUnknown, answered: false };
    case "date":
      return { say: lines.infoDate(facts.eventDate, facts.location), answered: true };
    case "venue":
      return { say: lines.infoVenue(facts.location, facts.venueDetails), answered: true };
    case "faq":
      return question.faq
        ? { say: question.faq.answer, answered: true }
        : { say: lines.noAnswer, answered: false };
    default:
      return { say: lines.noAnswer, answered: false };
  }
}
