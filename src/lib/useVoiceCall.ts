"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { voiceLines, type Lang } from "@/lib/voiceLines";

export interface Turn {
  role: "agent" | "user";
  content: string;
}

export type MicStatus = "off" | "starting" | "waiting" | "sound" | "speech";

export type CallPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ending"
  | "done"
  | "error";

export const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "gu-IN", label: "ગુજરાતી" },
] as const satisfies readonly { code: Lang; label: string }[];

const END_TOKEN = "[END]";
const MAX_SILENT_ROUNDS = 3;
const SUBMIT_AFTER_PAUSE_MS = 1600; // pause after the last word before an answer counts as complete
const NO_SPEECH_MS = 12000; // silence (after the mic is really open) before the agent asks again
const START_GUARD_MS = 7000; // the recognizer must open the mic within this time
const FATAL_MIC_ERRORS = ["not-allowed", "service-not-allowed", "audio-capture", "network"];

// Minimal typing for the (still prefixed) Web Speech recognition API.
interface RecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}


/** Best installed voice for a language: exact match first, then same language; prefers online/natural voices. */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const want = lang.toLowerCase();
  const base = want.split("-")[0];
  const voices = speechSynthesis.getVoices();
  const exact = voices.filter((v) => norm(v) === want);
  const pool = exact.length ? exact : voices.filter((v) => norm(v).split("-")[0] === base);
  return pool.find((v) => /online|natural|google/i.test(v.name)) ?? pool[0] ?? null;
}

function subscribeVoices(cb: () => void) {
  if (typeof speechSynthesis === "undefined") return () => undefined;
  speechSynthesis.addEventListener("voiceschanged", cb);
  return () => speechSynthesis.removeEventListener("voiceschanged", cb);
}

export function useVoiceCall(
  inviteeId: string,
  onFinished: (result: { outcome: string; summary: string }) => void
) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en-IN");
  const [seconds, setSeconds] = useState(0);
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [micLevel, setMicLevel] = useState(0);
  const [micLabel, setMicLabel] = useState("");
  const [micSupported] = useState(() => getRecognitionCtor() !== null);
  const voiceMissing = useSyncExternalStore(
    subscribeVoices,
    () => pickVoice(lang) === null,
    () => false
  );

  const turnsRef = useRef<Turn[]>([]);
  const activeRef = useRef(false);
  const genRef = useRef(0); // bumps on every agent turn so superseded turns go quiet
  const langRef = useRef(lang);
  const recCleanupRef = useRef<(() => void) | null>(null);
  const micBlockedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const silentRoundsRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const finishedCbRef = useRef(onFinished);
  const submitRef = useRef<(text: string) => void>(() => undefined);
  const listenRef = useRef<() => void>(() => undefined);
  const silenceRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    finishedCbRef.current = onFinished;
  }, [onFinished]);

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

  /** Speaks text and resolves when it finishes (never hangs: has a safety timeout). */
  const speak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (!text.trim() || typeof speechSynthesis === "undefined") {
        resolve();
        return;
      }
      const voice = pickVoice(langRef.current);
      if (!voice) {
        // No voice for this language: reading Hindi/Gujarati with an English voice
        // sounds like gibberish, so show the text only.
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
      // Chrome sometimes never fires onend; don't let the call freeze.
      const guard = setTimeout(done, 4000 + text.length * 90);
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  }, []);

  const stopListening = useCallback(() => {
    recCleanupRef.current?.();
    recCleanupRef.current = null;
    setInterim("");
  }, []);

  /** Opens the mic once per call (user gesture) and shows a live input level. */
  const stopMeter = useCallback(() => {
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setMicLevel(0);
    setMicLabel("");
  }, []);

  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicLabel(stream.getAudioTracks()[0]?.label ?? "");
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      meterTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setMicLevel(Math.min(1, peak / 48));
      }, 100);
    } catch {
      micBlockedRef.current = true;
      setNotice(
        "Microphone access was denied or no microphone was found. Click the lock icon in the address bar, allow the microphone, then start the call again — or type your replies."
      );
    }
  }, []);

  const endCall = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    genRef.current++;
    abortRef.current?.abort();
    stopListening();
    stopSpeaking();
    stopMeter();
    setPhase("ending");
    try {
      const res = await fetch(`/api/invitees/${inviteeId}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: turnsRef.current,
          durationSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the call.");
      setPhase("done");
      finishedCbRef.current(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the call.");
      setPhase("error");
    }
  }, [inviteeId, stopListening, stopMeter, stopSpeaking]);

  /** Streams one agent reply, speaking each sentence as soon as it is complete. */
  const agentTurn = useCallback(
    async (gen: number) => {
      setPhase("thinking");
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/voice/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeId, messages: turnsRef.current, lang: langRef.current }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "The voice agent did not respond.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let pending = "";
      let speaking: Promise<void> = Promise.resolve();
      const speakChain = (s: string) => {
        const clean = s.replace(END_TOKEN, "").trim();
        if (!clean) return;
        setPhase("speaking");
        speaking = speaking.then(() =>
          activeRef.current && gen === genRef.current ? speak(clean) : undefined
        );
      };

      let aborted = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          pending += chunk;
          const m = pending.match(/^([\s\S]*?[.!?।]+)(\s+)([\s\S]*)$/);
          if (m) {
            speakChain(m[1]);
            pending = m[3];
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) throw e;
        aborted = true;
      }
      if (!aborted) speakChain(pending);

      let text = full.replace(END_TOKEN, "").trim();
      const ended = !aborted && full.includes(END_TOKEN) && !text.includes("?");
      if (ended && !text) {
        // The model said only [END]; the call must still finish with a goodbye.
        text = voiceLines(langRef.current).goodbye;
        speakChain(text);
      }
      if (text && gen === genRef.current) pushTurn({ role: "agent", content: text });
      await speaking;
      return ended;
    },
    [inviteeId, pushTurn, speak]
  );

  /**
   * Listens for the invitee. Speech is treated as complete only after a real
   * pause, so short breaths mid-sentence don't cut the answer in half.
   */
  const listen = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!activeRef.current) return;
    if (!Ctor || micBlockedRef.current) {
      setMicStatus("off");
      setPhase("listening"); // typing mode
      return;
    }
    stopListening();
    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = true;
    rec.interimResults = true;

    let text = "";
    let settled = false;
    let audioStarted = false;
    let submitTimer: ReturnType<typeof setTimeout> | undefined;
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      settled = true;
      clearTimeout(submitTimer);
      clearTimeout(silenceTimer);
      clearTimeout(startGuard);
      rec.onresult = rec.onend = rec.onerror = null;
      rec.onaudiostart = rec.onsoundstart = rec.onspeechstart = null;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
      if (recCleanupRef.current === cleanup) recCleanupRef.current = null;
    };
    recCleanupRef.current = cleanup;

    /** Give up on the mic for this call and fall back to typing, with a reason. */
    const blockMic = (message: string) => {
      cleanup();
      micBlockedRef.current = true;
      setMicStatus("off");
      setNotice(message);
      setPhase("listening");
    };

    const finish = (kind: "speech" | "silence") => {
      if (settled) return;
      const heard = text.trim();
      cleanup();
      setInterim("");
      setMicStatus("off");
      if (!activeRef.current) return;
      if (kind === "speech" && heard) submitRef.current(heard);
      else silenceRef.current();
    };

    // The silence countdown only starts once the browser really has the mic open.
    rec.onaudiostart = () => {
      audioStarted = true;
      clearTimeout(startGuard);
      setMicStatus("waiting");
      silenceTimer = setTimeout(() => {
        if (!text.trim()) finish("silence");
      }, NO_SPEECH_MS);
    };
    rec.onsoundstart = () => setMicStatus("sound");
    rec.onspeechstart = () => setMicStatus("speech");
    rec.onresult = (e) => {
      clearTimeout(silenceTimer);
      let all = "";
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
      text = all;
      setInterim(all);
      clearTimeout(submitTimer);
      submitTimer = setTimeout(() => finish("speech"), SUBMIT_AFTER_PAUSE_MS);
    };
    rec.onerror = (e) => {
      if (e.error === "language-not-supported") {
        blockMic("This browser can't recognise speech in the selected language. Choose English, or type your replies.");
      } else if (e.error === "network") {
        blockMic("Speech recognition needs an internet connection to Google's speech service, and it isn't reachable. Please type your replies instead.");
      } else if (FATAL_MIC_ERRORS.includes(e.error)) {
        blockMic("The microphone is blocked or unavailable. Allow it in the browser's address bar, or type your replies instead.");
      }
      // "no-speech" / "aborted": handled by onend
    };
    rec.onend = () => finish(text.trim() ? "speech" : "silence");
    const startGuard = setTimeout(() => {
      if (!audioStarted) {
        blockMic("The browser could not start listening. Check the microphone permission and that the right microphone is selected in Chrome (chrome://settings/content/microphone), or type your replies instead.");
      }
    }, START_GUARD_MS);

    setMicStatus("starting");
    setPhase("listening");
    try {
      rec.start();
    } catch {
      blockMic("Could not start the microphone. Please type your replies instead.");
    }
  }, [stopListening]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  /** The invitee said nothing: re-prompt a couple of times, then say goodbye. */
  const handleSilence = useCallback(async () => {
    if (!activeRef.current) return;
    silentRoundsRef.current += 1;
    const round = silentRoundsRef.current;
    const last = round >= MAX_SILENT_ROUNDS;
    const lines = voiceLines(langRef.current);
    const line = last
      ? lines.unableToHear
      : round === 1
        ? lines.notUnderstood
        : lines.stillThere;
    if (round === 1) {
      setNotice(
        "The browser didn't pick up any speech. Talk only when the status says \"Your turn\", check that the level bar moves when you speak, or type your reply."
      );
    }
    pushTurn({ role: "agent", content: line });
    setPhase("speaking");
    await speak(line);
    if (!activeRef.current) return;
    if (last) await endCall();
    else listenRef.current();
  }, [endCall, pushTurn, speak]);

  useEffect(() => {
    silenceRef.current = () => void handleSilence();
  }, [handleSilence]);

  const runAgentThenContinue = useCallback(async () => {
    const gen = ++genRef.current;
    const stale = () => gen !== genRef.current || !activeRef.current;
    for (let attempt = 1; ; attempt++) {
      try {
        const ended = await agentTurn(gen);
        if (stale()) return;
        if (ended) await endCall();
        else listenRef.current();
        return;
      } catch (e) {
        if (stale()) return;
        if (attempt < 2) continue; // one automatic retry
        // Keep the call alive so the user can retry or end it and save what was said.
        setNotice(
          (e instanceof Error ? e.message : "The agent did not respond.") +
            " You can type your reply again, or end the call."
        );
        listenRef.current();
        return;
      }
    }
  }, [agentTurn, endCall]);

  const submitUser = useCallback(
    async (text: string) => {
      if (!activeRef.current || !text.trim()) return;
      // Typing or speaking always wins over whatever the agent is doing.
      abortRef.current?.abort();
      stopListening();
      stopSpeaking();
      setNotice(null);
      silentRoundsRef.current = 0;
      pushTurn({ role: "user", content: text.trim() });
      await runAgentThenContinue();
    },
    [pushTurn, runAgentThenContinue, stopListening, stopSpeaking]
  );

  useEffect(() => {
    submitRef.current = (text) => void submitUser(text);
  }, [submitUser]);

  const start = useCallback(async () => {
    setError(null);
    setNotice(null);
    setSeconds(0);
    turnsRef.current = [];
    setTurns([]);
    silentRoundsRef.current = 0;
    micBlockedRef.current = false;
    activeRef.current = true;
    startedAtRef.current = Date.now();
    setPhase("connecting");
    await startMeter();
    try {
      const health = await fetch("/api/voice/health");
      if (!health.ok) {
        const data = await health.json().catch(() => ({}));
        throw new Error(data.error ?? "The voice agent is not available.");
      }
      startedAtRef.current = Date.now();
      await runAgentThenContinue();
    } catch (e) {
      activeRef.current = false;
      stopMeter();
      setError(e instanceof Error ? e.message : "Could not start the call.");
      setPhase("error");
    }
  }, [runAgentThenContinue, startMeter, stopMeter]);

  /** Lets the user cut the agent off and start talking. */
  const interrupt = useCallback(() => {
    if (phase !== "speaking") return;
    abortRef.current?.abort();
    stopSpeaking();
  }, [phase, stopSpeaking]);

  useEffect(
    () => () => {
      activeRef.current = false;
      abortRef.current?.abort();
      recCleanupRef.current?.();
      if (meterTimerRef.current) clearInterval(meterTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close().catch(() => undefined);
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
    seconds,
    micSupported,
    micStatus,
    micLevel,
    micLabel,
    voiceMissing,
    start,
    endCall,
    sendText: submitUser,
    interrupt,
  };
}
