// Fixed spoken lines and language config, shared by the server (opening line)
// and the browser (silence prompts, goodbye fallback).

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

const LINES: Record<
  Lang,
  {
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
> = {
  "en-IN": {
    opening: (i) =>
      `Hello, may I speak with ${i.name}? I'm calling from GlobalVox about the ${i.event} on ${shortDate(i.date, "en-IN")} in ${i.location}. Will you be able to attend?`,
    notUnderstood: "Sorry, I didn't catch that. Could you please say that again?",
    stillThere: "Hello, are you still there?",
    unableToHear: "I'm unable to hear you, so we'll try again later. Thank you, goodbye!",
    goodbye: "Thank you so much for your time. Goodbye!",
    askGuests: "That's great! How many guests will you bring with you?",
    askWhen: "No problem. When will you be able to let us know?",
    retryAttend: "Sorry, I didn't get that. Will you attend? Please say yes, no or maybe.",
    retryGuests: "Sorry, I didn't get that. How many guests will you bring? Please say a number, or none.",
    retryWhen: "Sorry, I didn't get that. By when can you let us know? For example, tomorrow or next week.",
    closeYes: "Wonderful, we look forward to seeing you. Goodbye!",
    closeNo: "Thank you for letting us know. Goodbye!",
    closeMaybe: "Thank you, we'll follow up with you then. Goodbye!",
    closeUnclear: "Thank you for your time, we'll follow up later. Goodbye!",
    askAttend: "Will you be able to attend?",
    ackYes: "Wonderful, that's noted.",
    ackNo: "Thank you for letting us know.",
    ackMaybe: "Thank you, we'll follow up with you then.",
    askQuestions: "Do you have any questions?",
    moreQuestions: "Is there anything else you'd like to know?",
    goAhead: "Sure, please go ahead.",
    retryQuestions: "Sorry, I didn't catch that. Do you have any questions? Please say yes or no.",
    noAnswer: "I'm sorry, I don't have that detail. I'll pass your question to the team and they will get back to you.",
    infoDate: (d, loc) => `The event is on ${longDate(d, "en-IN")} in ${loc}.`,
    infoTime: (t) => `The event starts at ${t}.`,
    infoTimeUnknown: "The exact timings will be shared by the team soon.",
    infoVenue: (loc, details) =>
      details
        ? `The event is in ${loc}. ${details}`
        : `The event is in ${loc}. The team will share the full address.`,
  },
  "hi-IN": {
    opening: (i) =>
      `नमस्ते, क्या मैं ${i.name} से बात कर सकता हूँ? मैं ग्लोबलवॉक्स की ओर से ${i.location} में ${shortDate(i.date, "hi-IN")} को होने वाले ${i.event} के बारे में कॉल कर रहा हूँ। क्या आप इसमें शामिल हो पाएंगे?`,
    notUnderstood: "माफ़ कीजिए, मैं सुन नहीं पाया। क्या आप दोबारा बता सकते हैं?",
    stillThere: "हैलो, क्या आप वहाँ हैं?",
    unableToHear:
      "मुझे आपकी आवाज़ नहीं आ रही है, हम बाद में फिर कोशिश करेंगे। धन्यवाद, नमस्ते!",
    goodbye: "आपके समय के लिए बहुत धन्यवाद। नमस्ते!",
    askGuests: "बहुत बढ़िया! आप अपने साथ कितने मेहमान लाएंगे?",
    askWhen: "कोई बात नहीं। आप हमें कब तक बता पाएंगे?",
    retryAttend: "माफ़ कीजिए, समझ नहीं आया। क्या आप आएंगे? कृपया हाँ, ना या शायद कहें।",
    retryGuests: "माफ़ कीजिए, समझ नहीं आया। आप कितने मेहमान लाएंगे? कृपया कोई संख्या बताएं, या कोई नहीं कहें।",
    retryWhen: "माफ़ कीजिए, समझ नहीं आया। आप कब तक बता पाएंगे? जैसे कल या अगले हफ़्ते।",
    closeYes: "बहुत अच्छा, हम आपका इंतज़ार करेंगे। नमस्ते!",
    closeNo: "बताने के लिए धन्यवाद। नमस्ते!",
    closeMaybe: "धन्यवाद, हम तब आपसे संपर्क करेंगे। नमस्ते!",
    closeUnclear: "आपके समय के लिए धन्यवाद, हम बाद में संपर्क करेंगे। नमस्ते!",
    askAttend: "क्या आप आ पाएंगे?",
    ackYes: "बहुत अच्छा, यह नोट कर लिया गया है।",
    ackNo: "बताने के लिए धन्यवाद।",
    ackMaybe: "धन्यवाद, हम तब आपसे संपर्क करेंगे।",
    askQuestions: "क्या आपका कोई प्रश्न है?",
    moreQuestions: "क्या आप कुछ और जानना चाहेंगे?",
    goAhead: "जी, कृपया पूछिए।",
    retryQuestions: "माफ़ कीजिए, समझ नहीं आया। क्या आपका कोई प्रश्न है? कृपया हाँ या ना कहें।",
    noAnswer: "माफ़ कीजिए, मेरे पास यह जानकारी नहीं है। मैं आपका प्रश्न टीम तक पहुँचा दूँगा और वे आपसे संपर्क करेंगे।",
    infoDate: (d, loc) => `कार्यक्रम ${longDate(d, "hi-IN")} को ${loc} में है।`,
    infoTime: (t) => `कार्यक्रम का समय ${t} है।`,
    infoTimeUnknown: "सटीक समय टीम जल्द ही बताएगी।",
    infoVenue: (loc, details) =>
      details
        ? `कार्यक्रम ${loc} में है। ${details}`
        : `कार्यक्रम ${loc} में है। पूरा पता टीम साझा करेगी।`,
  },
  "gu-IN": {
    opening: (i) =>
      `નમસ્તે, શું હું ${i.name} સાથે વાત કરી શકું? હું ગ્લોબલવોક્સ તરફથી ${i.location}માં ${shortDate(i.date, "gu-IN")}ના રોજ યોજાનાર ${i.event} વિશે ફોન કરી રહ્યો છું. શું તમે હાજર રહી શકશો?`,
    notUnderstood: "માફ કરજો, મને સંભળાયું નહીં. શું તમે ફરીથી કહી શકશો?",
    stillThere: "હેલો, શું તમે ત્યાં છો?",
    unableToHear:
      "મને તમારો અવાજ સંભળાતો નથી, અમે પછી ફરી પ્રયત્ન કરીશું. આભાર, નમસ્તે!",
    goodbye: "તમારા સમય માટે ખૂબ આભાર. નમસ્તે!",
    askGuests: "ખૂબ સરસ! તમે સાથે કેટલા મહેમાનોને લાવશો?",
    askWhen: "કોઈ વાંધો નહીં. તમે અમને ક્યારે જણાવી શકશો?",
    retryAttend: "માફ કરજો, સમજાયું નહીં. શું તમે આવશો? કૃપા કરીને હા, ના અથવા કદાચ કહો.",
    retryGuests: "માફ કરજો, સમજાયું નહીં. તમે કેટલા મહેમાનો લાવશો? કૃપા કરીને સંખ્યા કહો, અથવા કોઈ નહીં.",
    retryWhen: "માફ કરજો, સમજાયું નહીં. તમે ક્યાં સુધીમાં જણાવી શકશો? જેમ કે કાલે અથવા આવતા અઠવાડિયે.",
    closeYes: "ખૂબ સરસ, અમે તમારી રાહ જોઈશું. નમસ્તે!",
    closeNo: "જણાવવા બદલ આભાર. નમસ્તે!",
    closeMaybe: "આભાર, અમે ત્યારે તમારો સંપર્ક કરીશું. નમસ્તે!",
    closeUnclear: "તમારા સમય માટે આભાર, અમે પછી સંપર્ક કરીશું. નમસ્તે!",
    askAttend: "શું તમે આવી શકશો?",
    ackYes: "ખૂબ સરસ, નોંધ લેવામાં આવી છે.",
    ackNo: "જણાવવા બદલ આભાર.",
    ackMaybe: "આભાર, અમે ત્યારે તમારો સંપર્ક કરીશું.",
    askQuestions: "શું તમારે કોઈ પ્રશ્ન છે?",
    moreQuestions: "શું તમે બીજું કંઈ જાણવા માંગો છો?",
    goAhead: "જી, કૃપા કરીને પૂછો.",
    retryQuestions: "માફ કરજો, સમજાયું નહીં. શું તમારે કોઈ પ્રશ્ન છે? કૃપા કરીને હા અથવા ના કહો.",
    noAnswer: "માફ કરજો, મારી પાસે આ માહિતી નથી. હું તમારો પ્રશ્ન ટીમને પહોંચાડીશ અને તેઓ તમારો સંપર્ક કરશે.",
    infoDate: (d, loc) => `કાર્યક્રમ ${longDate(d, "gu-IN")} ના રોજ ${loc} માં છે.`,
    infoTime: (t) => `કાર્યક્રમનો સમય ${t} છે.`,
    infoTimeUnknown: "ચોક્કસ સમય ટીમ ટૂંક સમયમાં જણાવશે.",
    infoVenue: (loc, details) =>
      details
        ? `કાર્યક્રમ ${loc} માં છે. ${details}`
        : `કાર્યક્રમ ${loc} માં છે. પૂરું સરનામું ટીમ જણાવશે.`,
  },
};

export function voiceLines(lang: Lang) {
  return LINES[lang];
}
