export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";
/**
 * Model used to double-check answers the Lite call rules can't place. Defaults to the main
 * model: a 1B model was tried and wrongly accepted most random answers, so it is not used.
 */
export const OLLAMA_CLASSIFY_MODEL = process.env.OLLAMA_CLASSIFY_MODEL ?? OLLAMA_MODEL;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const OPTIONS = { num_ctx: 2048, temperature: 0.4 };

export class OllamaError extends Error {}

async function ollamaFetch(path: string, body: unknown, timeoutMs: number, model = OLLAMA_MODEL) {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new OllamaError(
      `Could not reach Ollama at ${OLLAMA_URL}. Make sure Ollama is running.`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new OllamaError(
        `Model "${model}" is not installed. Run: ollama pull ${model}`
      );
    }
    throw new OllamaError(`Ollama error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

/** Streams the assistant reply as plain-text chunks. */
export async function streamChat(
  messages: ChatMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const res = await ollamaFetch(
    "/api/chat",
    {
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      keep_alive: "30m",
      options: { ...OPTIONS, num_predict: 90 },
    },
    120_000
  );
  if (!res.body) throw new OllamaError("Ollama returned an empty response.");

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = res.body.getReader();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as { message?: { content?: string } };
          if (chunk.message?.content) {
            controller.enqueue(encoder.encode(chunk.message.content));
          }
        } catch {
          // ignore a malformed partial line
        }
      }
    },
    cancel() {
      return reader.cancel();
    },
  });
}

/** Non-streaming call constrained to a JSON schema. */
export async function chatJson<T>(
  messages: ChatMessage[],
  schema: object,
  opts: { model?: string; numPredict?: number; timeoutMs?: number } = {}
): Promise<T> {
  const model = opts.model ?? OLLAMA_MODEL;
  const res = await ollamaFetch(
    "/api/chat",
    {
      model,
      messages,
      stream: false,
      format: schema,
      keep_alive: "30m",
      options: { ...OPTIONS, temperature: 0, num_predict: opts.numPredict ?? 200 },
    },
    opts.timeoutMs ?? 120_000,
    model
  );
  const data = (await res.json()) as { message?: { content?: string } };
  try {
    return JSON.parse(data.message?.content ?? "") as T;
  } catch {
    throw new OllamaError("Model returned invalid JSON.");
  }
}

/** Reports whether Ollama is up and the configured model is installed. */
export async function checkOllama(): Promise<
  { ok: true; model: string } | { ok: false; error: string }
> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    return {
      ok: false,
      error: `Ollama is not running at ${OLLAMA_URL}. Start it, then try again.`,
    };
  }
  const data = (await res.json()) as { models?: { name: string }[] };
  const names = (data.models ?? []).map((m) => m.name);
  const wanted = OLLAMA_MODEL.includes(":") ? OLLAMA_MODEL : `${OLLAMA_MODEL}:latest`;
  if (!names.includes(wanted)) {
    return {
      ok: false,
      error: `Model "${OLLAMA_MODEL}" is not installed. Run: ollama pull ${OLLAMA_MODEL}`,
    };
  }
  return { ok: true, model: OLLAMA_MODEL };
}

/** Loads the model into memory so the first real turn isn't slow. */
export async function warmUp(model = OLLAMA_MODEL) {
  await ollamaFetch(
    "/api/generate",
    { model, prompt: "", keep_alive: "30m" },
    120_000,
    model
  ).catch(() => undefined);
}

/** Short plain-text completion (a few words), much cheaper than a chat + JSON reply. */
export async function generateWord(
  prompt: string,
  opts: { model?: string; numPredict?: number; timeoutMs?: number } = {}
): Promise<string> {
  const model = opts.model ?? OLLAMA_MODEL;
  const res = await ollamaFetch(
    "/api/generate",
    {
      model,
      prompt,
      stream: false,
      keep_alive: "30m",
      options: {
        temperature: 0,
        num_ctx: 512,
        num_predict: opts.numPredict ?? 4,
        stop: ["\n"],
      },
    },
    opts.timeoutMs ?? 20_000,
    model
  );
  const data = (await res.json()) as { response?: string };
  return (data.response ?? "").trim();
}
