// Fixed spoken lines and language config, shared by the server (opening line)
// and the browser (silence prompts, goodbye fallback).
// Hindi and Gujarati verbs change with the speaker's gender ("कर रहा हूँ" / "कर रही हूँ"),
// so lines are built for the agent's voice: a woman's voice saying the masculine form is
// one of the quickest ways to sound like a machine.

import type { AgentVoice } from "@/lib/agentPrompt";

export type Lang = "en-IN" | "hi-IN" | "gu-IN";

export const LANG_CODES: Lang[] = ["en-IN", "hi-IN", "gu-IN"];

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANG_CODES as string[]).includes(v);
}

export const LANG_NAMES: Record<Lang, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "gu-IN": "Gujarati",
};

interface OpeningInput {
  name: string;
  event: string;
  date: Date;
  location: string;
}

function longDate(d: Date, lang: Lang) {
  return d.toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
}

function shortDate(d: Date, lang: Lang) {
  return d.toLocaleDateString(lang, { day: "numeric", month: "long" });
}

interface Lines {
  opening: (i: OpeningInput) => string;
  notUnderstood: string;
  stillThere: string;
  unableToHear: string;
  goodbye: string;
  // Scripted (offline) call lines
  askGuests: string;
  askWhen: string;
  retryAttend: string;
  retryGuests: string;
  retryWhen: string;
  closeYes: string;
  closeNo: string;
  closeMaybe: string;
  closeUnclear: string;
  // Follow-up questions and the closing round
  askAttend: string;
  ackYes: string;
  ackNo: string;
  ackMaybe: string;
  askQuestions: string;
  moreQuestions: string;
  goAhead: string;
  retryQuestions: string;
  noAnswer: string;
  infoDate: (date: Date, location: string) => string;
  infoTime: (time: string) => string;
  infoTimeUnknown: string;
  infoVenue: (location: string, details?: string | null) => string;
}

/** Picks the feminine or masculine form. */
type G = (female: string, male: string) => string;

const buildLines = (g: G): Record<Lang, Lines> => ({
  "en-IN": {
    opening: (i) =>
      `Hi, is this ${i.name}? I'm calling from GlobalVox about the ${i.event}, it's on ${shortDate(i.date, "en-IN")} in ${i.location}. Do you think you'll be able to make it?`,
    notUnderstood: "Sorry, I didn't quite catch that. Could you say that again?",
    stillThere: "Hello? Are you still there?",
    unableToHear: "I can't seem to hear you, so we'll try again a little later. Thanks, bye!",
    goodbye: "Thanks so much for your time. Bye for now!",
    askGuests: "Oh, that's great! How many guests will you be bringing?",
    askWhen: "No worries at all. When do you think you'll be able to let us know?",
    retryAttend: "Sorry, I missed that. Will you be coming? A yes, no or maybe is fine.",
    retryGuests: "Sorry, I missed that. How many guests will you be bringing? A number is fine, or none.",
    retryWhen: "Sorry, I missed that. By when can you let us know? Something like tomorrow or next week works.",
    closeYes: "Wonderful, we can't wait to see you. Bye for now!",
    closeNo: "Alright, thanks for letting us know. Bye!",
    closeMaybe: "Okay, thanks. We'll check in with you then. Bye!",
    closeUnclear: "Thanks for your time, we'll follow up a bit later. Bye!",
    askAttend: "Will you be able to make it?",
    ackYes: "Wonderful, I've noted that down.",
    ackNo: "Alright, thanks for letting us know.",
    ackMaybe: "Okay, thanks. We'll check in with you then.",
    askQuestions: "Do you have any questions for me?",
    moreQuestions: "Anything else you'd like to know?",
    goAhead: "Sure, go ahead.",
    retryQuestions: "Sorry, I missed that. Do you have any questions? A yes or no is fine.",
    noAnswer: "Hmm, I don't have that detail with me. I'll pass your question to the team and they'll get back to you.",
    infoDate: (d, loc) => `It's on ${longDate(d, "en-IN")} in ${loc}.`,
    infoTime: (t) => `It starts at ${t}.`,
    infoTimeUnknown: "The team will share the exact timings soon.",
    infoVenue: (loc, details) =>
      details
        ? `It's in ${loc}. ${details}`
        : `It's in ${loc}, and the team will share the full address.`,
  },
  "hi-IN": {
    opening: (i) =>
      `हैलो, नमस्ते! क्या मेरी बात ${i.name} जी से हो रही है? मैं GlobalVox से ${g("बोल रही", "बोल रहा")} हूँ। ${shortDate(i.date, "hi-IN")} को ${i.location} में ${i.event} है, उसी के लिए फ़ोन किया था। आप आ पाएंगे?`,
    notUnderstood: `सॉरी, मैं ठीक से ${g("सुन नहीं पाई", "सुन नहीं पाया")}। एक बार फिर से बोलेंगे?`,
    stillThere: "हैलो? आप लाइन पर हैं?",
    unableToHear: `लगता है आवाज़ नहीं आ रही, मैं थोड़ी देर में फिर से कॉल ${g("करती", "करता")} हूँ। थैंक यू!`,
    goodbye: "आपने टाइम दिया, बहुत-बहुत धन्यवाद। अच्छा, नमस्ते!",
    askGuests: "अरे वाह, बढ़िया! आपके साथ कितने लोग आएंगे?",
    askWhen: "कोई बात नहीं जी। आप हमें कब तक बता पाएंगे?",
    retryAttend: "सॉरी, समझ नहीं आया। आप आ पाएंगे? बस हाँ, ना या शायद बता दीजिए।",
    retryGuests: "सॉरी, समझ नहीं आया। आपके साथ कितने लोग आएंगे? कोई नंबर बता दीजिए, या कोई नहीं।",
    retryWhen: "सॉरी, समझ नहीं आया। कब तक बता पाएंगे? जैसे कल या अगले हफ़्ते।",
    closeYes: "बहुत बढ़िया, फिर मिलते हैं वहाँ पर! नमस्ते!",
    closeNo: "कोई बात नहीं जी, बताने के लिए थैंक यू। नमस्ते!",
    closeMaybe: "ठीक है जी, हम तब आपसे पूछ लेंगे। नमस्ते!",
    closeUnclear: "आपके टाइम के लिए थैंक यू, हम बाद में बात करते हैं। नमस्ते!",
    askAttend: "तो आप आ पाएंगे?",
    ackYes: "बढ़िया, मैंने नोट कर लिया।",
    ackNo: "ठीक है जी, बताने के लिए थैंक यू।",
    ackMaybe: "ठीक है, हम तब आपसे पूछ लेंगे।",
    askQuestions: "आपका कोई सवाल है?",
    moreQuestions: "और कुछ जानना है आपको?",
    goAhead: "हाँ जी, पूछिए।",
    retryQuestions: "सॉरी, समझ नहीं आया। कोई सवाल है? बस हाँ या ना बता दीजिए।",
    noAnswer: `ये जानकारी अभी मेरे पास नहीं है। मैं आपका सवाल टीम तक ${g("पहुँचा दूँगी", "पहुँचा दूँगा")}, वो आपको बता देंगे।`,
    infoDate: (d, loc) => `प्रोग्राम ${longDate(d, "hi-IN")} को ${loc} में है।`,
    infoTime: (t) => `प्रोग्राम ${t} शुरू होगा।`,
    infoTimeUnknown: "सही टाइम टीम जल्दी ही बता देगी।",
    infoVenue: (loc, details) =>
      details
        ? `प्रोग्राम ${loc} में है। ${details}`
        : `प्रोग्राम ${loc} में है। पूरा पता टीम भेज देगी।`,
  },
  "gu-IN": {
    opening: (i) =>
      `હેલો, નમસ્તે! શું હું ${i.name} સાથે વાત કરું છું? હું GlobalVox માંથી ${g("બોલી રહી", "બોલી રહ્યો")} છું. ${shortDate(i.date, "gu-IN")}ના રોજ ${i.location}માં ${i.event} છે, એના માટે ફોન કર્યો હતો. તમે આવી શકશો?`,
    notUnderstood: "સોરી, મને બરાબર સંભળાયું નહીં. એક વાર ફરીથી કહેશો?",
    stillThere: "હેલો? તમે લાઇન પર છો?",
    unableToHear: "લાગે છે અવાજ નથી આવતો, હું થોડી વાર પછી ફરી ફોન કરીશ. થેન્ક યુ!",
    goodbye: "તમે સમય આપ્યો એ માટે ખૂબ ખૂબ આભાર. આવજો!",
    askGuests: "અરે વાહ, મજા આવશે! તમારી સાથે કેટલા લોકો આવશે?",
    askWhen: "કંઈ વાંધો નહીં. તમે અમને ક્યાં સુધીમાં કહી શકશો?",
    retryAttend: "સોરી, સમજાયું નહીં. તમે આવી શકશો? બસ હા, ના કે કદાચ કહી દો.",
    retryGuests: "સોરી, સમજાયું નહીં. તમારી સાથે કેટલા લોકો આવશે? કોઈ નંબર કહો, અથવા કોઈ નહીં.",
    retryWhen: "સોરી, સમજાયું નહીં. ક્યાં સુધીમાં કહી શકશો? જેમ કે કાલે કે આવતા અઠવાડિયે.",
    closeYes: "સરસ, તો ત્યાં મળીએ! આવજો!",
    closeNo: "કંઈ વાંધો નહીં, જણાવવા બદલ થેન્ક યુ. આવજો!",
    closeMaybe: "સારું, તો અમે ત્યારે તમને પૂછી લઈશું. આવજો!",
    closeUnclear: "તમારા સમય માટે આભાર, અમે પછી વાત કરીશું. આવજો!",
    askAttend: "તો તમે આવી શકશો?",
    ackYes: "સરસ, મેં નોંધી લીધું.",
    ackNo: "સારું, જણાવવા બદલ થેન્ક યુ.",
    ackMaybe: "સારું, અમે ત્યારે તમને પૂછી લઈશું.",
    askQuestions: "તમારે કોઈ સવાલ છે?",
    moreQuestions: "બીજું કંઈ જાણવું છે?",
    goAhead: "હા, પૂછો ને.",
    retryQuestions: "સોરી, સમજાયું નહીં. કોઈ સવાલ છે? બસ હા કે ના કહો.",
    noAnswer: "આ માહિતી અત્યારે મારી પાસે નથી. હું તમારો સવાલ ટીમને પહોંચાડીશ, તેઓ તમને જણાવશે.",
    infoDate: (d, loc) => `પ્રોગ્રામ ${longDate(d, "gu-IN")}ના રોજ ${loc}માં છે.`,
    infoTime: (t) => `પ્રોગ્રામ ${t} શરૂ થશે.`,
    infoTimeUnknown: "ચોક્કસ સમય ટીમ જલ્દી જણાવશે.",
    infoVenue: (loc, details) =>
      details
        ? `પ્રોગ્રામ ${loc}માં છે. ${details}`
        : `પ્રોગ્રામ ${loc}માં છે. પૂરું સરનામું ટીમ મોકલી દેશે.`,
  },
});

const LINES: Record<AgentVoice, Record<Lang, Lines>> = {
  female: buildLines((f) => f),
  male: buildLines((_f, m) => m),
};

type VariantKey = "notUnderstood" | "stillThere" | "ackYes" | "ackNo" | "goAhead" | "goodbye";

// Alternative phrasings for lines a caller may hear several times, so the agent
// doesn't repeat itself word for word. The base line in LINES is always one option.
const VARIANTS: Record<Lang, Partial<Record<VariantKey, string[]>>> = {
  "en-IN": {
    notUnderstood: ["Sorry, could you say that once more?", "Oh, sorry, I didn't get that. One more time?"],
    stillThere: ["Hello? Can you hear me?", "Hi, are you there?"],
    ackYes: ["Perfect, got it.", "Great, I've noted that down."],
    ackNo: ["No problem, thanks for letting us know.", "Okay, thanks for telling me."],
    goAhead: ["Of course, go ahead.", "Sure, what would you like to know?"],
    goodbye: ["Lovely talking to you. Take care, bye!", "Thanks a lot, have a good day. Bye!"],
  },
  "hi-IN": {
    notUnderstood: ["माफ़ कीजिए, एक बार फिर से बोलेंगे?", "सॉरी, आवाज़ थोड़ी कट गई। फिर से बताएंगे?"],
    stillThere: ["हैलो? मेरी आवाज़ आ रही है?", "हैलो जी, आप हैं लाइन पर?"],
    ackYes: ["बढ़िया, नोट कर लिया।", "अच्छा, ठीक है, हो गया।"],
    ackNo: ["कोई बात नहीं, बताने के लिए धन्यवाद।", "अच्छा ठीक है जी, थैंक यू।"],
    goAhead: ["जी बिल्कुल, पूछिए।", "हाँ बताइए, क्या जानना है?"],
    goodbye: ["आपसे बात करके अच्छा लगा। अपना ध्यान रखिए, नमस्ते!", "बहुत-बहुत थैंक यू जी। आपका दिन अच्छा रहे, नमस्ते!"],
  },
  "gu-IN": {
    notUnderstood: ["માફ કરજો, એક વાર ફરી કહેશો?", "સોરી, અવાજ થોડો કપાઈ ગયો. ફરીથી કહેશો?"],
    stillThere: ["હેલો? મારો અવાજ આવે છે?", "હેલો, તમે લાઇન પર છો ને?"],
    ackYes: ["સરસ, નોંધી લીધું.", "બરાબર, થઈ ગયું."],
    ackNo: ["કંઈ વાંધો નહીં, જણાવવા બદલ આભાર.", "સારું, થેન્ક યુ."],
    goAhead: ["હા ચોક્કસ, પૂછો.", "હા બોલો, શું જાણવું છે?"],
    goodbye: ["તમારી સાથે વાત કરીને મજા આવી. ધ્યાન રાખજો, આવજો!", "ખૂબ ખૂબ આભાર. તમારો દિવસ સારો જાય, આવજો!"],
  },
};

/** Spoken lines for a language, in the grammatical gender of the agent's voice. */
export function voiceLines(lang: Lang, gender: AgentVoice = "female"): Lines {
  const base = LINES[gender][lang];
  const extra = VARIANTS[lang];
  // Each read of a varied line picks one of its phrasings at random.
  const out = { ...base };
  for (const key of Object.keys(extra) as VariantKey[]) {
    const options = [base[key], ...(extra[key] ?? [])];
    Object.defineProperty(out, key, {
      get: () => options[Math.floor(Math.random() * options.length)],
      enumerable: true,
      configurable: true,
    });
  }
  return out;
}
