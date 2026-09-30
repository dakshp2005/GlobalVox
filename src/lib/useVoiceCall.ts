"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isLang, type Lang } from "@/lib/voiceLines";
import type { AgentVoice } from "@/lib/agentPrompt";

// A call with the local voice server (voice-server/): the microphone streams to it and the
// agent's voice streams back, like a phone line. Speech recognition, the language model and
// the voices all run locally; nothing here depends on a cloud service.

export interface Turn {
  role: "agent" | "user";
  content: string;
}

export type MicStatus = "off" | "starting" | "on";

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

export interface CallResult {
  outcome: string;
  summary: string;
  callbackAt?: string | null;
}

export const VOICE_SERVER_URL =
  process.env.NEXT_PUBLIC_VOICE_SERVER_URL ?? "ws://localhost:8765/ws";

const PLAYBACK_RATE = 24000; // what the voice server sends
const CUT_MARK = " —"; // marks an agent turn the invitee talked over

type ServerEvent =
  | { type: "user"; text: string }
  | { type: "agent"; text: string }
  | { type: "agent_interrupted" }
  | { type: "interrupted" }
  | { type: "lang"; lang: string }
  | { type: "end"; reason?: string };

export function useVoiceCall(
  inviteeId: string,
  onFinished: (result: CallResult) => void,
  voicePreference: AgentVoice = "female"
) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en-IN");
  const [langSwitched, setLangSwitched] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [micLevel, setMicLevel] = useState(0);
  const [micLabel, setMicLabel] = useState("");

  const turnsRef = useRef<Turn[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const activeRef = useRef(false);
  const startedAtRef = useRef(0);
  const finishedCbRef = useRef(onFinished);
  const langRef = useRef(lang);
  // Microphone
  const micCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Playback
  const playCtxRef = useRef<AudioContext | null>(null);
  const playheadRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const agentOpenRef = useRef(false); // the agent's current turn is still being spoken
  const endRequestedRef = useRef(false);

  useEffect(() => {
    finishedCbRef.current = onFinished;
  }, [onFinished]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    if (phase === "idle" || phase === "done" || phase === "error") return;
    const t = setInterval(
      () => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [phase]);

  const commitTurns = useCallback((next: Turn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  /** Adds what the agent said; consecutive sentences of one reply form one turn. */
  const addAgentText = useCallback(
    (text: string) => {
      const list = turnsRef.current;
      const last = list.at(-1);
      if (last?.role === "agent" && agentOpenRef.current) {
        commitTurns([...list.slice(0, -1), { ...last, content: `${last.content} ${text}` }]);
      } else {
        commitTurns([...list, { role: "agent", content: text }]);
      }
      agentOpenRef.current = true;
    },
    [commitTurns]
  );

  const stopPlayback = useCallback(() => {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    sourcesRef.current.clear();
    playheadRef.current = 0;
  }, []);

  const releaseAudio = useCallback(() => {
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void micCtxRef.current?.close().catch(() => undefined);
    micCtxRef.current = null;
    stopPlayback();
    void playCtxRef.current?.close().catch(() => undefined);
    playCtxRef.current = null;
    setMicStatus("off");
    setMicLevel(0);
  }, [stopPlayback]);

  const endCall = useCallback(async () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    releaseAudio();
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
  }, [inviteeId, releaseAudio]);

  /** Queues a chunk of the agent's voice right after the previous one. */
  const playChunk = useCallback(
    (data: ArrayBuffer) => {
      const ctx = playCtxRef.current;
      if (!ctx || data.byteLength < 2) return;
      const pcm = new Int16Array(data);
      const buffer = ctx.createBuffer(1, pcm.length, PLAYBACK_RATE);
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const at = Math.max(ctx.currentTime + 0.02, playheadRef.current);
      src.start(at);
      playheadRef.current = at + buffer.duration;
      sourcesRef.current.add(src);
      setPhase("speaking");
      src.onended = () => {
        sourcesRef.current.delete(src);
        if (sourcesRef.current.size === 0 && activeRef.current) {
          setPhase("listening");
          // The agent said goodbye: hang up once it has finished speaking.
          if (endRequestedRef.current) void endCall();
        }
      };
    },
    [endCall]
  );

  const handleEvent = useCallback(
    (ev: ServerEvent) => {
      switch (ev.type) {
        case "user": {
          agentOpenRef.current = false;
          commitTurns([...turnsRef.current, { role: "user", content: ev.text }]);
          setPhase("thinking");
          break;
        }
        case "agent":
          addAgentText(ev.text);
          break;
        case "interrupted":
          // The invitee started talking: stop the agent's voice at once.
          stopPlayback();
          setPhase("listening");
          break;
        case "agent_interrupted": {
          const last = turnsRef.current.at(-1);
          if (last?.role === "agent" && agentOpenRef.current && !last.content.endsWith(CUT_MARK.trim())) {
            commitTurns([...turnsRef.current.slice(0, -1), { ...last, content: last.content + CUT_MARK }]);
          }
          agentOpenRef.current = false;
          break;
        }
        case "lang":
          if (isLang(ev.lang) && ev.lang !== langRef.current) {
            setLang(ev.lang);
            setLangSwitched(true);
          }
          break;
        case "end":
          endRequestedRef.current = true;
          if (sourcesRef.current.size === 0) void endCall();
          break;
      }
    },
    [addAgentText, commitTurns, endCall, stopPlayback]
  );

  const startMic = useCallback(async (ws: WebSocket) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation keeps the agent's own voice (played by this page) out of the mic,
      // so it can't interrupt itself. Noise suppression and AGC are left off: stacked with
      // the server's own RNNoise filter, they double-gate quiet speech onsets and AGC's
      // pumping right at utterance start fights the goal of detecting speech immediately.
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    streamRef.current = stream;
    setMicLabel(stream.getAudioTracks()[0]?.label ?? "");
    const ctx = new AudioContext();
    micCtxRef.current = ctx;
    await ctx.audioWorklet.addModule("/voice/pcm-capture.js");
    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-capture");
    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    source.connect(worklet);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    meterTimerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setMicLevel(Math.min(1, peak / 48));
    }, 100);
    setMicStatus("on");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setNotice(null);
    setSeconds(0);
    setLangSwitched(false);
    commitTurns([]);
    agentOpenRef.current = false;
    endRequestedRef.current = false;
    activeRef.current = true;
    startedAtRef.current = Date.now();
    setPhase("connecting");
    setMicStatus("starting");

    try {
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeId, lang: langRef.current, gender: voicePreference }),
      });
      const session = await res.json();
      if (!res.ok) throw new Error(session.error ?? "Could not prepare the call.");

      // The playback context must be created from the click that started the call.
      playCtxRef.current = new AudioContext({ sampleRate: PLAYBACK_RATE });
      const ws = new WebSocket(VOICE_SERVER_URL);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 8000);
        ws.onopen = () => {
          clearTimeout(timer);
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("unreachable"));
        };
      }).catch(() => {
        throw new Error(
          `The local voice server isn't running at ${VOICE_SERVER_URL}. Start it with "npm run voice-server" (see voice-server/README.md).`
        );
      });

      ws.onmessage = (e) => {
        if (typeof e.data === "string") {
          try {
            handleEvent(JSON.parse(e.data) as ServerEvent);
          } catch {
            // ignore a malformed message
          }
        } else {
          playChunk(e.data as ArrayBuffer);
        }
      };
      ws.onclose = () => {
        if (activeRef.current) void endCall();
      };
      ws.send(JSON.stringify(session));
      startedAtRef.current = Date.now();

      try {
        await startMic(ws);
      } catch {
        setMicStatus("off");
        setNotice(
          "Microphone access was denied or no microphone was found. Allow it from the lock icon in the address bar, or type your replies below."
        );
      }
      setPhase((p) => (p === "connecting" ? "speaking" : p));
    } catch (e) {
      activeRef.current = false;
      wsRef.current?.close();
      wsRef.current = null;
      releaseAudio();
      setError(e instanceof Error ? e.message : "Could not start the call.");
      setPhase("error");
    }
  }, [commitTurns, endCall, handleEvent, inviteeId, playChunk, releaseAudio, startMic, voicePreference]);

  /** A typed reply, for when there's no microphone. */
  const sendText = useCallback((text: string) => {
    const t = text.trim();
    const ws = wsRef.current;
    if (!t || !ws || ws.readyState !== WebSocket.OPEN) return;
    stopPlayback();
    ws.send(JSON.stringify({ type: "text", text: t }));
  }, [stopPlayback]);

  useEffect(
    () => () => {
      activeRef.current = false;
      wsRef.current?.close();
      if (meterTimerRef.current) clearInterval(meterTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void micCtxRef.current?.close().catch(() => undefined);
      void playCtxRef.current?.close().catch(() => undefined);
    },
    []
  );

  return {
    phase,
    turns,
    error,
    notice,
    lang,
    setLang,
    langSwitched,
    seconds,
    micStatus,
    micLevel,
    micLabel,
    start,
    endCall,
    sendText,
  };
}
