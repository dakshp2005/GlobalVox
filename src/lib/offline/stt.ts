"use client";

// On-device speech recognition (Vosk, WebAssembly). Once the model file has been
// downloaded from this app's own /models folder, nothing here uses the network.

import type { Model } from "vosk-browser";
import type { Lang } from "@/lib/voiceLines";

export const MODEL_FILES: Record<Lang, string> = {
  "en-IN": "/models/vosk-model-small-en-us-0.15.tar.gz",
  "hi-IN": "/models/vosk-model-small-hi-0.22.tar.gz",
  "gu-IN": "/models/vosk-model-small-gu-0.42.tar.gz",
};

export class ModelMissingError extends Error {}

const loaded = new Map<Lang, Promise<Model>>();

/** Downloads (once) and initialises the model for a language, reporting 0-100 progress. */
export function loadModel(lang: Lang, onProgress: (pct: number) => void): Promise<Model> {
  const cached = loaded.get(lang);
  if (cached) {
    onProgress(100);
    return cached;
  }
  const promise = (async () => {
    const res = await fetch(MODEL_FILES[lang]);
    if (!res.ok || !res.body) {
      throw new ModelMissingError(
        "The offline speech model is not installed. Run: node scripts/download-vosk-models.js"
      );
    }
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let got = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as Uint8Array<ArrayBuffer>);
      got += value.length;
      if (total) onProgress(Math.min(99, Math.round((got / total) * 100)));
    }
    // Hand the worker a blob URL so it doesn't download the file a second time.
    const url = URL.createObjectURL(new Blob(parts, { type: "application/gzip" }));
    const { createModel } = await import("vosk-browser");
    const model = await createModel(url);
    onProgress(100);
    return model;
  })();
  loaded.set(lang, promise);
  promise.catch(() => loaded.delete(lang)); // allow a retry after a failure
  return promise;
}

export interface MicSession {
  sampleRate: number;
  label: string;
  /** Receives raw audio chunks; pass null to stop feeding (e.g. while the agent speaks). */
  setSink(fn: ((chunk: Float32Array) => void) | null): void;
  close(): void;
}

const WORKLET_SOURCE = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; this.blocks = 0; this.peak = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > this.peak) this.peak = a;
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage({ chunk: this.buf.slice(0) }); this.n = 0; }
    }
    if (++this.blocks % 12 === 0) { this.port.postMessage({ level: this.peak }); this.peak = 0; }
    return true;
  }
}
registerProcessor("gv-tap", Tap);
`;

/** Opens the microphone (needs a user gesture) and streams 16 kHz audio to the current sink. */
export async function openMic(onLevel: (level: number) => void): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: 16000 });
  } catch {
    ctx = new AudioContext();
  }
  // Browsers may start audio contexts suspended; don't wait on it, just ask it to run.
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  const workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(workletUrl);
  URL.revokeObjectURL(workletUrl);

  const node = new AudioWorkletNode(ctx, "gv-tap");
  let sink: ((chunk: Float32Array) => void) | null = null;
  node.port.onmessage = (e: MessageEvent<{ chunk?: Float32Array; level?: number }>) => {
    if (e.data.chunk) sink?.(e.data.chunk);
    if (e.data.level !== undefined) onLevel(Math.min(1, e.data.level * 3));
  };
  const source = ctx.createMediaStreamSource(stream);
  const mute = ctx.createGain();
  mute.gain.value = 0; // keep the graph running without playing the mic back
  source.connect(node).connect(mute).connect(ctx.destination);

  return {
    sampleRate: ctx.sampleRate,
    label: stream.getAudioTracks()[0]?.label ?? "",
    setSink(fn) {
      sink = fn;
    },
    close() {
      sink = null;
      node.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => undefined);
    },
  };
}

/**
 * Starts recognising speech from the mic. `onFinal` fires when the person
 * finishes an utterance (Vosk detects the pause itself, so there is no extra wait).
 */
export function recognize(
  model: Model,
  mic: MicSession,
  handlers: { onPartial: (text: string) => void; onFinal: (text: string) => void }
): { stop(): void } {
  const rec = new model.KaldiRecognizer(mic.sampleRate);
  rec.on("partialresult", (m) => {
    if (m.event === "partialresult") handlers.onPartial(m.result.partial);
  });
  rec.on("result", (m) => {
    if (m.event === "result" && m.result.text.trim()) handlers.onFinal(m.result.text.trim());
  });
  mic.setSink((chunk) => rec.acceptWaveformFloat(chunk, mic.sampleRate));
  return {
    stop() {
      mic.setSink(null);
      rec.remove();
    },
  };
}
