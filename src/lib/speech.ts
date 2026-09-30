// Shared text-to-speech helpers: voice choice, prosody and text prep.
// The browser's default voice settings are flat and monotone, so every
// utterance goes through these to sound more like a person on a phone call.

import type { AgentVoice } from "@/lib/agentPrompt";

/** Legacy desktop voices that sound the most synthetic. */
const ROBOTIC_VOICE = /\b(david|zira|mark|hazel|george)\b/i;

// The Web Speech API doesn't say whether a voice is male or female, so go by the names of
// the voices Windows, Edge, Chrome and Android actually ship for Indian English, Hindi and
// Gujarati. Chrome's own "Google हिन्दी" / "Google ગુજરાતી" voices are female.
const FEMALE_VOICE =
  /\b(swara|kalpana|heera|neerja|dhwani|aarti|ananya|kavya|sapna|zira|hazel|susan|sonia|libby|jenny|aria|female|woman)\b|google (हिन्दी|ગુજરાતી|us english|uk english female)/i;
const MALE_VOICE =
  /\b(madhur|hemant|prabhat|ravi|niranjan|aarav|kunal|david|mark|george|guy|ryan|male|man)\b/i;

/** Gender of a voice, when its name gives it away. */
export function voiceGender(v: SpeechSynthesisVoice | null): AgentVoice | null {
  if (!v) return null;
  if (/female/i.test(v.name)) return "female";
  if (MALE_VOICE.test(v.name)) return "male";
  if (FEMALE_VOICE.test(v.name)) return "female";
  return null;
}

function voiceScore(v: SpeechSynthesisVoice, gender?: AgentVoice): number {
  let score = 0;
  if (/natural|neural/i.test(v.name)) score += 3;
  if (/online|google/i.test(v.name)) score += 2;
  if (ROBOTIC_VOICE.test(v.name)) score -= 2;
  if (gender) {
    const g = voiceGender(v);
    if (g === gender) score += 2;
    else if (g) score -= 2;
  }
  return score;
}

/**
 * Best installed voice for a language: exact locale first, then same language,
 * then the most natural-sounding one (neural > online/Google > the rest), preferring
 * the requested gender. `localOnly` restricts to voices installed on the device,
 * which work offline.
 */
export function pickVoice(
  lang: string,
  { localOnly = false, gender }: { localOnly?: boolean; gender?: AgentVoice } = {}
): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const want = lang.toLowerCase();
  const base = want.split("-")[0];
  const voices = speechSynthesis.getVoices().filter((v) => !localOnly || v.localService);
  const exact = voices.filter((v) => norm(v) === want);
  const pool = exact.length ? exact : voices.filter((v) => norm(v).split("-")[0] === base);
  // Array.sort is stable, so equal scores keep the browser's own ordering.
  return [...pool].sort((a, b) => voiceScore(b, gender) - voiceScore(a, gender))[0] ?? null;
}

/** Small tweaks that make the sentence read less like a machine. */
export function prepareForSpeech(text: string): string {
  return text
    .replace(/\[END\]/g, "")
    .replace(/\((?:laughs?|smiles?|pauses?|chuckles?)\)|\*[^*]+\*/gi, "") // stage directions
    .replace(/[*_#`~]+/g, "") // markdown the model sometimes adds
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "") // emojis
    .replace(/\s*[—–]\s*$/, "") // the "cut off" dash on interrupted turns
    .replace(/!+/g, ".") // most voices over-emphasise "!"
    .replace(/\bRSVP\b/g, "R S V P")
    .replace(/^(Okay|Alright|Great|Perfect|Sure|Wonderful|Oh|Ah|Achha|Haan ji)(?=\s+\S)/i, "$1,") // a natural pause
    .replace(/\s+/g, " ")
    .trim();
}

/** Sets voice, language, rate and pitch on an utterance. */
export function buildUtterance(text: string, voice: SpeechSynthesisVoice, lang: string) {
  const u = new SpeechSynthesisUtterance(prepareForSpeech(text));
  u.voice = voice;
  u.lang = voice.lang;
  const baseRate = lang.toLowerCase().startsWith("en") ? 0.97 : 0.93;
  u.rate = baseRate * (0.96 + Math.random() * 0.08); // ±4% so repeated lines don't sound identical
  u.pitch = 0.98 + Math.random() * 0.04;
  return u;
}

/** A short, slightly varied gap between sentences. */
export function sentencePause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 120));
}
