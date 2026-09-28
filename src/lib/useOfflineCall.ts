"use client";

// Lite RSVP call: scripted questions, rule-based understanding backed by a small
// local model for unclear answers, and a local-first result queue.
//   - Speech in: Chrome's recognition when online, on-device Vosk otherwise.
//   - Every answer is validated; unclear answers are re-asked, never accepted.
//   - Works without internet (rules + on-device speech); the small model is optional.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Model } from "vosk-browser";
import { voiceLines, type Lang } from "@/lib/voiceLines";
import { advance, initialState, scriptResult, type ScriptState } from "@/lib/offline/script";
import { parseFaqNotes, type EventFacts } from "@/lib/offline/faq";
import { understand, warmSmallModel, type UnderstoodBy } from "@/lib/offline/understand";
import { loadModel, openMic, recognize, type MicSession } from "@/lib/offline/stt";
import { startWebSpeech, webSpeechSupported, type FatalKind } from "@/lib/offline/webSpeech";
import {
  enqueue,
  isOnline,
  isSimulatedOffline,
  pendingCount,
  setSimulatedOffline,
  subscribeQueue,
  syncQueue,
} from "@/lib/offline/queue";
import type { Turn } from "@/lib/useVoiceCall";

export type OfflinePhase =
  | "idle"
  | "loading"
  | "listening"
  | "thinking"
  | "speaking"
  | "saving"
  | "done"
  | "error";

export type SpeechEngine = "chrome" | "vosk";

export interface OfflineContext {
  name: string;
  event: string;
  eventDate: string;
  location: string;
  /** Optional details the agent answers callers' questions with. */
  eventTime?: string | null;
  venueDetails?: string | null;
  faqNotes?: string | null;
}

function buildFacts(c: OfflineContext): EventFacts {
  return {
    eventDate: new Date(c.eventDate),
    location: c.location,
    eventTime: c.eventTime,
    venueDetails: c.venueDetails,
    faq: parseFaqNotes(c.faqNotes),
  };
}

const NO_SPEECH_MS = 12000;
const MAX_SILENT_ROUNDS = 3;

/** Only voices installed on the device (localService) work without internet. */
function pickLocalVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const want = lang.toLowerCase();
  const base = want.split("-")[0];
  const local = speechSynthesis.getVoices().filter((v) => v.localService);
  return (
    local.find((v) => norm(v) === want) ?? local.find((v) => norm(v).split("-")[0] === base) ?? null
  );
}

function subscribeVoices(cb: () => void) {
  if (typeof speechSynthesis === "undefined") return () => undefined;
  speechSynthesis.addEventListener("voiceschanged", cb);
  return () => speechSynthesis.removeEventListener("voiceschanged", cb);
}

export function useOfflineCall(
  inviteeId: string,
  context: OfflineContext,
  onFinished: () => void
) {
  const [phase, setPhase] = useState<OfflinePhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en-IN");
  const [progress, setProgress] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micLabel, setMicLabel] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [engine, setEngine] = useState<SpeechEngine | null>(null);
  const [understood, setUnderstood] = useState<{ by: UnderstoodBy; ms: number } | null>(null);
  const [result, setResult] = useState<{ outcome: string; summary: string } | null>(null);
  const [latency, setLatency] = useState<{ last: number | null; avg: number | null }>({
    last: null,
    avg: null,
  });

  const online = useSyncExternalStore(subscribeQueue, isOnline, () => true);
  const simulated = useSyncExternalStore(subscribeQueue, isSimulatedOffline, () => false);
  const pending = useSyncExternalStore(subscribeQueue, pendingCount, () => 0);
  const voiceMissing = useSyncExternalStore(
    subscribeVoices,
    () => pickLocalVoice(lang) === null,
    () => false
  );

  const turnsRef = useRef<Turn[]>([]);
  const activeRef = useRef(false);
  const genRef = useRef(0);
  const langRef = useRef(lang);
  const scriptRef = useRef<ScriptState>(initialState());
  const modelRef = useRef<Model | null>(null);
  const modelLoadRef = useRef<Promise<void> | null>(null);
  const micRef = useRef<MicSession | null>(null);
  const recRef = useRef<{ stop(): void } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const silentRoundsRef = useRef(0);
  const chromeFailedRef = useRef(false);
  const modelFailedRef = useRef(false);
  const startedAtRef = useRef(0);
  const latenciesRef = useRef<number[]>([]);
  const contextRef = useRef(context);
  const finishedRef = useRef(onFinished);
  const listenRef = useRef<() => void>(() => undefined);
  const silenceRef = useRef<() => void>(() => undefined);
  const userRef = useRef<(text: string, t0: number) => void>(() => undefined);

  useEffect(() => {
    langRef.current = lang;
    contextRef.current = context;
    finishedRef.current = onFinished;
  }, [lang, context, onFinished]);

  useEffect(() => {
    if (phase === "idle" || phase === "done" || phase === "error") return;
    const t = setInterval(
      () => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [phase]);

  const pushTurn = useCallback((turn: Turn) => {
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
  }, []);

  /** Speaks with a device-installed voice. `onStart` fires when sound begins (for latency). */
  const speak = useCallback((text: string, onStart?: () => void) => {
    return new Promise<void>((resolve) => {
      const voice = pickLocalVoice(langRef.current);
      if (!voice || typeof speechSynthesis === "undefined") {
        onStart?.();
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve();
      };
      const guard = setTimeout(done, 4000 + text.length * 90);
      u.onstart = () => onStart?.();
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  const stopRecognizing = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    recRef.current?.stop();
    recRef.current = null;
    setInterim("");
  }, []);

  const releaseAudio = useCallback(() => {
    stopRecognizing();
    stopSpeaking();
    micRef.current?.close();
    micRef.current = null;
    setMicLevel(0);
  }, [stopRecognizing, stopSpeaking]);

  const syncNow = useCallback(async () => {
    const r = await syncQueue();
    if (r.synced > 0) finishedRef.current();
    return r;
  }, []);

  // Push anything waiting whenever a connection is (or becomes) available.
  useEffect(() => {
    if (online) void syncNow();
  }, [online, syncNow]);

  const finish = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    genRef.current++;
    releaseAudio();
    setPhase("saving");

    const userSpoke = turnsRef.current.some((t) => t.role === "user");
    const { outcome, summary } = userSpoke
      ? scriptResult(scriptRef.current)
      : { outcome: "NO_ANSWER", summary: "The invitee did not speak during the call." };

    // Local first: the result is safe on this device even if the server is unreachable.
    enqueue({
      inviteeId,
      body: {
        outcome,
        summary,
        transcript: turnsRef.current,
        durationSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
        endedAt: new Date().toISOString(),
      },
    });
    setResult({ outcome, summary });
    setPhase("done");
    await syncNow();
  }, [inviteeId, releaseAudio, syncNow]);

  /** Starts listening with the best available speech engine. */
  const listen = useCallback(() => {
    if (!activeRef.current) return;
    stopRecognizing();
    const gen = genRef.current;
    const armSilence = () => {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => silenceRef.current(), NO_SPEECH_MS);
    };

    // 1) Chrome's recognition while a connection is available.
    if (webSpeechSupported() && isOnline() && !chromeFailedRef.current) {
      setEngine("chrome");
      setPhase("listening");
      recRef.current = startWebSpeech(langRef.current, {
        onPartial: (t) => {
          if (t) {
            clearTimeout(silenceTimerRef.current);
            setInterim(t);
          }
        },
        onFinal: (t) => userRef.current(t, performance.now()),
        onNoSpeech: () => silenceRef.current(),
        onFatal: (kind: FatalKind) => {
          if (!activeRef.current || gen !== genRef.current) return;
          chromeFailedRef.current = true;
          setNotice(
            kind === "network"
              ? "Chrome's speech service isn't reachable, so the app switched to on-device speech recognition."
              : kind === "language"
                ? "Chrome can't recognise this language, so the app switched to on-device speech recognition."
                : "Chrome's speech recognition was blocked, so the app switched to on-device speech recognition."
          );
          listenRef.current();
        },
      });
      armSilence();
      return;
    }

    // 2) On-device Vosk (works with no internet).
    const model = modelRef.current;
    const mic = micRef.current;
    if (!model && modelFailedRef.current) {
      setNotice("The on-device speech model isn't available. Please type your replies.");
      setEngine(null);
      setPhase("listening");
      return;
    }
    if (!model) {
      // The model is still loading in the background: wait for it.
      setPhase("loading");
      void modelLoadRef.current?.then(() => {
        if (activeRef.current && gen === genRef.current) listenRef.current();
      });
      return;
    }
    setPhase("listening");
    if (!mic) {
      setEngine(null); // no microphone: typing only
      return;
    }
    setEngine("vosk");
    recRef.current = recognize(model, mic, {
      onPartial: (t) => {
        if (t) {
          clearTimeout(silenceTimerRef.current);
          setInterim(t);
        }
      },
      onFinal: (t) => userRef.current(t, performance.now()),
    });
    armSilence();
  }, [stopRecognizing]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const handleUser = useCallback(
    async (text: string, t0: number = performance.now()) => {
      if (!activeRef.current || !text.trim()) return;
      const gen = ++genRef.current;
      stopRecognizing();
      stopSpeaking();
      setNotice(null);
      silentRoundsRef.current = 0;
      pushTurn({ role: "user", content: text.trim() });
      setPhase("thinking");

      // Rules first; the small model only when the rules can't place the answer.
      const facts = buildFacts(contextRef.current);
      const u = await understand(scriptRef.current.step, text, langRef.current, facts.faq);
      if (!activeRef.current || gen !== genRef.current) return;
      setUnderstood({ by: u.by, ms: u.ms });

      const step = advance(scriptRef.current, u.interp, langRef.current, facts);
      scriptRef.current = step.state;
      pushTurn({ role: "agent", content: step.say });
      setPhase("speaking");
      await speak(step.say, () => {
        const ms = Math.round(performance.now() - t0);
        latenciesRef.current.push(ms);
        const all = latenciesRef.current;
        setLatency({ last: ms, avg: Math.round(all.reduce((a, b) => a + b, 0) / all.length) });
      });
      if (!activeRef.current || gen !== genRef.current) return;
      if (step.end) await finish();
      else listenRef.current();
    },
    [finish, pushTurn, speak, stopRecognizing, stopSpeaking]
  );

  useEffect(() => {
    userRef.current = (text, t0) => void handleUser(text, t0);
  }, [handleUser]);

  /** The invitee said nothing: re-prompt twice, then say goodbye and record NO_ANSWER. */
  const handleSilence = useCallback(async () => {
    if (!activeRef.current) return;
    const gen = ++genRef.current;
    stopRecognizing();
    silentRoundsRef.current += 1;
    const round = silentRoundsRef.current;
    const lines = voiceLines(langRef.current);
    const last = round >= MAX_SILENT_ROUNDS;
    const line = last ? lines.unableToHear : round === 1 ? lines.notUnderstood : lines.stillThere;
    if (round === 1) {
      setNotice("No speech was detected. Speak when the status says \"Your turn\", or type your reply.");
    }
    pushTurn({ role: "agent", content: line });
    setPhase("speaking");
    await speak(line);
    if (!activeRef.current || gen !== genRef.current) return;
    if (last) await finish();
    else listenRef.current();
  }, [finish, pushTurn, speak, stopRecognizing]);

  useEffect(() => {
    silenceRef.current = () => void handleSilence();
  }, [handleSilence]);

  const start = useCallback(async () => {
    setError(null);
    setNotice(null);
    setResult(null);
    setSeconds(0);
    setProgress(0);
    setUnderstood(null);
    setEngine(null);
    turnsRef.current = [];
    setTurns([]);
    latenciesRef.current = [];
    setLatency({ last: null, avg: null });
    silentRoundsRef.current = 0;
    chromeFailedRef.current = false;
    modelFailedRef.current = false;
    scriptRef.current = initialState();
    activeRef.current = true;
    const gen = ++genRef.current;
    startedAtRef.current = Date.now();
    setPhase("loading");

    warmSmallModel();

    // The on-device model is always prepared (it is the offline fallback). When Chrome's
    // recognition is usable we don't wait for it: it loads in the background.
    const chromeUsable = webSpeechSupported() && isOnline();
    modelLoadRef.current = loadModel(langRef.current, setProgress).then(
      (m) => {
        modelRef.current = m;
      },
      (e) => {
        modelRef.current = null;
        modelFailedRef.current = true;
        if (!chromeUsable && activeRef.current) {
          activeRef.current = false;
          setError(e instanceof Error ? e.message : "Could not load the on-device speech model.");
          setPhase("error");
        }
      }
    );
    if (!chromeUsable) {
      await modelLoadRef.current;
      if (!activeRef.current || gen !== genRef.current) return;
    }

    try {
      micRef.current = await openMic(setMicLevel);
      setMicLabel(micRef.current.label);
    } catch {
      micRef.current = null;
      setNotice(
        "Microphone unavailable. Allow it in the address bar, or type your replies below."
      );
    }
    if (!activeRef.current || gen !== genRef.current) {
      micRef.current?.close();
      micRef.current = null;
      return;
    }

    startedAtRef.current = Date.now();
    const c = contextRef.current;
    const opening = voiceLines(langRef.current).opening({
      name: c.name,
      event: c.event,
      date: new Date(c.eventDate),
      location: c.location,
    });
    scriptRef.current = { ...scriptRef.current, lastSay: opening };
    pushTurn({ role: "agent", content: opening });
    setPhase("speaking");
    await speak(opening);
    if (!activeRef.current || gen !== genRef.current) return;
    listenRef.current();
  }, [pushTurn, speak]);

  /** End the call. If nothing has been said yet, the attempt is simply discarded. */
  const endCall = useCallback(async () => {
    if (!activeRef.current) return;
    if (turnsRef.current.length === 0) {
      activeRef.current = false;
      genRef.current++;
      releaseAudio();
      setPhase("idle");
      return;
    }
    await finish();
  }, [finish, releaseAudio]);

  useEffect(
    () => () => {
      activeRef.current = false;
      genRef.current++;
      clearTimeout(silenceTimerRef.current);
      recRef.current?.stop();
      micRef.current?.close();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    },
    []
  );

  return {
    phase,
    turns,
    interim,
    error,
    notice,
    lang,
    setLang,
    progress,
    micLevel,
    micLabel,
    seconds,
    engine,
    understood,
    result,
    latency,
    online,
    simulated,
    pending,
    voiceMissing,
    start,
    endCall,
    sendText: (text: string) => handleUser(text),
    syncNow,
    setSimulatedOffline,
  };
}
