// Rule-based understanding of short RSVP answers (English, Hindi, Gujarati).
// Runs in the browser in well under a millisecond, with no model and no network.

export type Answer = "YES" | "NO" | "MAYBE" | "UNKNOWN";

const DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
  "૦": "0", "૧": "1", "૨": "2", "૩": "3", "૪": "4", "૫": "5", "૬": "6", "૭": "7", "૮": "8", "૯": "9",
};

/** Lowercases, unifies Devanagari/Gujarati spelling variants and strips punctuation. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[०-९૦-૯]/g, (ch) => DIGITS[ch])
    .replace(/़/g, "") // Devanagari nukta
    .replace(/ँ/g, "ं") // chandrabindu -> anusvara (हाँ == हां)
    .replace(/ઁ/g, "ં") // Gujarati chandrabindu -> anusvara
    .replace(/[‌‍]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const tokens = (s: string) => normalize(s).split(" ").filter(Boolean);

const PHRASES: Record<Exclude<Answer, "UNKNOWN">, string[]> = {
  MAYBE: [
    // English
    "maybe", "perhaps", "not sure", "unsure", "not certain", "not certain yet", "let me check",
    "let me see", "i'll let you know", "will let you know", "depends", "it depends", "might",
    "possibly", "think about it", "let me think", "i'll see", "will see", "tentative", "no idea",
    "don't know", "dont know", "not decided", "can't say", "cant say", "get back to you",
    // Hindi
    "शायद", "पता नहीं", "देखते हैं", "देखता हूं", "देखती हूं", "सोचकर", "सोच कर", "बाद में बताता",
    "बाद में बताती", "कह नहीं सकता", "कह नहीं सकती", "निश्चित नहीं", "तय नहीं", "अभी नहीं पता",
    "shayad", "pata nahi", "pata nahin", "dekhte hain", "baad mein batata", "baad me batata",
    // Gujarati
    "કદાચ", "ખબર નથી", "જોઈશું", "જોઈએ", "પછી કહીશ", "પછી જણાવીશ", "વિચારી", "નક્કી નથી", "નક્કી નહીં",
    "kadach", "khabar nathi",
  ],
  NO: [
    // English
    "no", "nope", "nah", "can't", "cant", "cannot", "can not", "won't", "wont", "will not",
    "not coming", "not attending", "not able", "unable", "unfortunately", "decline",
    "i'm busy", "im busy", "not possible", "not going", "won't be able", "will not be able",
    // Hindi
    "नहीं", "नही", "मना", "नहीं आ पाऊंगा", "नहीं आ पाऊंगी", "नहीं आ सकता", "नहीं आ सकती", "नहीं आऊंगा", "नहीं आऊंगी", "नहीं जा",
    "nahi", "nahin", "nai", "nahi aa", "mana",
    // Gujarati
    "ના", "નહીં", "નહિ", "નથી", "નહીં આવી", "નહીં આવું", "નથી આવવાનો", "નથી આવવાની", "ન આવી શકું",
    "nathi", "nahi avu",
  ],
  YES: [
    // English
    "yes", "yeah", "yep", "yup", "sure", "definitely", "absolutely", "ok", "okay", "of course",
    "certainly", "i'll be there", "ill be there", "i will be there", "i will come", "i'll come",
    "ill come", "will attend", "i will attend", "count me in", "coming", "attending", "i'm in",
    "sounds good", "surely", "why not",
    // Hindi
    "हां", "जी", "जी हां", "जरूर", "जरुर", "बिल्कुल", "ठीक है", "आऊंगा", "आऊंगी", "आएंगे", "आ जाऊंगा",
    "आ जाऊंगी", "आ रहा हूं", "आ रही हूं", "पक्का", "हाजिर",
    "haan", "han", "haa", "ji", "ji haan", "zaroor", "jarur", "bilkul", "aaunga", "aaungi", "aayenge",
    "pakka",
    // Gujarati
    "હા", "હાં", "ચોક્કસ", "જરૂર", "આવીશ", "આવીશું", "આવશે", "આવી જઈશ", "બરાબર", "પાક્કું", "હાજર રહીશ",
    "haa", "avish", "chokkas",
  ],
};

/** Words that only count when they are the entire answer (too ambiguous inside a sentence). */
const EXACT: Record<"YES" | "NO", string[]> = {
  YES: ["ha", "हा", "હા"],
  NO: ["na", "ना", "न", "ના"],
};

type Cat = Exclude<Answer, "UNKNOWN">;
interface Match {
  cat: Cat;
  start: number;
  end: number; // exclusive
}

const LEXICON: { cat: Cat; toks: string[] }[] = (Object.keys(PHRASES) as Cat[]).flatMap((cat) =>
  PHRASES[cat].map((p) => ({ cat, toks: tokens(p) }))
);
const EXACT_SETS = {
  YES: new Set(EXACT.YES.map(normalize)),
  NO: new Set(EXACT.NO.map(normalize)),
};

function findPhrases(toks: string[], lexicon: { cat: Cat; toks: string[] }[]): Match[] {
  const found: Match[] = [];
  for (const { cat, toks: p } of lexicon) {
    if (!p.length) continue;
    for (let i = 0; i + p.length <= toks.length; i++) {
      if (p.every((w, k) => toks[i + k] === w)) found.push({ cat, start: i, end: i + p.length });
    }
  }
  return found;
}

/**
 * Classifies a short answer as YES / NO / MAYBE / UNKNOWN.
 * "Not sure" style answers win; otherwise the last clear YES/NO in the answer wins
 * ("yes but actually I can't" -> NO). A phrase inside a longer phrase is ignored
 * ("पता नहीं" is MAYBE, not NO).
 */
export function classifyAnswer(text: string): Answer {
  const toks = tokens(text);
  if (!toks.length) return "UNKNOWN";
  const whole = toks.join(" ");
  if (EXACT_SETS.YES.has(whole)) return "YES";
  if (EXACT_SETS.NO.has(whole)) return "NO";

  const all = findPhrases(toks, LEXICON);
  if (!all.length) return "UNKNOWN";
  const kept = all.filter(
    (m) =>
      !all.some(
        (o) =>
          o !== m &&
          o.start <= m.start &&
          o.end >= m.end &&
          o.end - o.start > m.end - m.start
      )
  );
  if (kept.some((m) => m.cat === "MAYBE")) return "MAYBE";
  kept.sort((a, b) => a.start - b.start || a.end - b.end);
  return kept[kept.length - 1].cat;
}

const ALONE = [
  "just me", "only me", "alone", "myself", "by myself", "no guests", "no guest", "none", "nobody",
  "no one", "without guests", "just i", "only i", "zero",
  "अकेला", "अकेले", "अकेली", "सिर्फ मैं", "केवल मैं", "कोई नहीं", "कोई नही", "akela", "akele", "akeli",
  "koi nahi", "sirf main",
  "એકલો", "એકલી", "ફક્ત હું", "માત્ર હું", "કોઈ નહીં", "કોઈ નથી", "eklo",
].map((p) => ({ cat: "NO" as Cat, toks: tokens(p) }));

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाच": 5, "छह": 6, "छः": 6, "छे": 6,
  "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  ek: 1, teen: 3, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  "એક": 1, "બે": 2, "ત્રણ": 3, "ચાર": 4, "પાંચ": 5, "છ": 6, "સાત": 7, "આઠ": 8, "નવ": 9, "દસ": 10,
};

const COMPANION_WORDS = new Set(
  [
    "wife", "husband", "spouse", "partner", "friend", "colleague", "girlfriend", "boyfriend",
    "पत्नी", "पति", "दोस्त", "सहकर्मी", "પત્ની", "પતિ", "મિત્ર", "સહકર્મી",
  ].map(normalize)
);

/** Number of guests mentioned in an answer, or null if none could be found. */
export function extractGuests(text: string): number | null {
  const toks = tokens(text);
  if (!toks.length) return null;
  if (findPhrases(toks, ALONE).length) return 0;
  for (const t of toks) {
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      return n <= 50 ? n : null;
    }
    const w = NUMBER_WORDS[t];
    if (w !== undefined) return w;
  }
  if (toks.some((t) => COMPANION_WORDS.has(t))) return 1;
  return null;
}

const TIME_WORDS = new Set(
  [
    // English
    "today", "tonight", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday",
    "saturday", "sunday", "week", "weeks", "weekend", "month", "months", "day", "days", "hour",
    "hours", "morning", "evening", "afternoon", "night", "later", "soon", "after", "before", "next",
    "end", "tomorrow's", "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december", "diwali", "holi", "eid", "weekday", "sometime",
    // Hindi
    "आज", "कल", "परसों", "अगले", "अगला", "अगली", "हफ्ते", "हफ्ता", "सप्ताह", "महीने", "महीना", "दिन",
    "बाद", "पहले", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "बृहस्पतिवार", "शुक्रवार", "शनिवार",
    "रविवार", "सुबह", "शाम", "रात", "दोपहर", "जल्द", "जल्दी", "दिवाली", "होली",
    "aaj", "kal", "parso", "agle", "agla", "hafte", "hafta", "mahine", "mahina", "din", "baad",
    "pehle", "somvar", "mangalvar", "budhvar", "guruvar", "shukravar", "shanivar", "ravivar",
    "subah", "shaam", "raat", "jaldi",
    // Gujarati
    "આજે", "કાલે", "પરમદિવસે", "આવતા", "આવતી", "અઠવાડિયે", "અઠવાડિયામાં", "અઠવાડિયું", "મહિને",
    "મહિનામાં", "મહિનો", "દિવસ", "દિવસમાં", "પછી", "પહેલા", "સોમવાર", "સોમવારે", "મંગળવાર",
    "મંગળવારે", "બુધવાર", "બુધવારે", "ગુરુવાર", "ગુરુવારે", "શુક્રવાર", "શુક્રવારે", "શનિવાર",
    "શનિવારે", "રવિવાર", "રવિવારે", "સવારે", "સાંજે", "રાત્રે", "બપોરે", "જલ્દી", "દિવાળી",
    "kale", "aavta", "pachi", "savare", "sanje",
  ].map(normalize)
);

/** True if the answer mentions a day, date, number or timeframe ("next Friday", "kal", "શુક્રવારે"). */
export function looksLikeTimeframe(text: string): boolean {
  return tokens(text).some((t) => /\d/.test(t) || TIME_WORDS.has(t));
}

const NO_MORE_QUESTIONS = [
  // English
  "no questions", "no question", "nothing", "nothing else", "that's all", "thats all", "that is all",
  "all good", "i'm good", "im good", "all clear", "that's it", "thats it", "no more", "not really",
  "don't have", "dont have", "do not have", "nothing to ask", "no doubts", "no doubt", "none",
  // Hindi
  "कोई प्रश्न नहीं", "कोई सवाल नहीं", "कुछ नहीं", "बस", "बस इतना ही", "और कुछ नहीं", "सब ठीक है",
  "koi sawal nahi", "koi prashn nahi", "kuch nahi", "bas",
  // Gujarati
  "કોઈ પ્રશ્ન નથી", "કંઈ નહીં", "કાંઈ નહીં", "બસ", "બીજું કંઈ નહીં", "બધું બરાબર",
].map((p) => tokens(p));

/** True if the invitee says they have no (more) questions: "no", "nothing", "that's all", "कुछ नहीं". */
export function noMoreQuestions(text: string): boolean {
  const toks = tokens(text);
  if (!toks.length) return false;
  if (NO_MORE_QUESTIONS.some((p) => p.length && p.length <= toks.length &&
      toks.some((_, i) => p.every((w, k) => toks[i + k] === w)))) return true;
  return classifyAnswer(text) === "NO";
}
