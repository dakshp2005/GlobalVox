"use client";

// Chrome/Edge built-in speech recognition (needs internet). Used by the Lite call
// mode when a connection is available; the on-device Vosk engine (stt.ts) takes
// over when it isn't.

interface Result {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type Ctor = new () => Recognition;

function getCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const webSpeechSupported = () => getCtor() !== null;

export type FatalKind = "network" | "blocked" | "language";

const PAUSE_MS = 1200; // silence after the last word before the answer counts as finished

export function startWebSpeech(
  lang: string,
  h: {
    onPartial: (text: string) => void;
    onFinal: (text: string) => void;
    /** The browser stopped listening without hearing any words. */
    onNoSpeech: () => void;
    /** The engine cannot be used (no internet, blocked mic, unsupported language). */
    onFatal: (kind: FatalKind) => void;
  }
): { stop(): void } {
  const Rec = getCtor();
  if (!Rec) {
    queueMicrotask(() => h.onFatal("blocked"));
    return { stop() {} };
  }
  const rec = new Rec();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;

  let text = "";
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    settled = true;
    clearTimeout(timer);
    rec.onresult = rec.onend = rec.onerror = null;
    try {
      rec.abort();
    } catch {
      // already stopped
    }
  };
  const finalize = () => {
    if (settled) return;
    const heard = text.trim();
    stop();
    if (heard) h.onFinal(heard);
    else h.onNoSpeech();
  };

  rec.onresult = (e) => {
    let all = "";
    for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
    text = all;
    h.onPartial(all);
    clearTimeout(timer);
    timer = setTimeout(finalize, PAUSE_MS);
  };
  rec.onerror = (e) => {
    if (settled) return;
    const kind: FatalKind | null =
      e.error === "network"
        ? "network"
        : e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture"
          ? "blocked"
          : e.error === "language-not-supported"
            ? "language"
            : null;
    if (kind) {
      stop();
      h.onFatal(kind);
    }
    // "no-speech" / "aborted": handled by onend
  };
  rec.onend = finalize;

  try {
    rec.start();
  } catch {
    stop();
    h.onFatal("blocked");
  }
  return { stop };
}
