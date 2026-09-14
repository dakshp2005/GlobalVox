import type { CallOutcome } from "@prisma/client";

export interface SimulatedCallResult {
  outcome: CallOutcome;
  durationSeconds: number;
  errorMessage: string | null;
}

/**
 * Stands in for the external AI voice-calling provider referenced in the
 * assessment brief. Mimics real-world flakiness (variable duration,
 * no-answers, provider errors) so the campaign engine has something
 * realistic to handle, without making real calls.
 */
export async function simulateCall(): Promise<SimulatedCallResult> {
  // Small artificial delay so batches feel asynchronous without making
  // large campaigns slow to process in a serverless request.
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 220));

  const roll = Math.random();
  let outcome: CallOutcome;
  let errorMessage: string | null = null;

  if (roll < 0.45) {
    outcome = "CONFIRMED";
  } else if (roll < 0.65) {
    outcome = "DECLINED";
  } else if (roll < 0.8) {
    outcome = "UNDECIDED";
  } else if (roll < 0.92) {
    outcome = "NO_ANSWER";
    errorMessage = "No answer after maximum rings";
  } else {
    outcome = "PROVIDER_ERROR";
    errorMessage = pick([
      "Provider connection timeout",
      "Carrier rejected the call",
      "Invalid number reported by provider",
      "Provider service temporarily unavailable",
    ]);
  }

  // Real conversations vary in length; keep it plausible.
  const durationSeconds =
    outcome === "NO_ANSWER" || outcome === "PROVIDER_ERROR"
      ? Math.round(3 + Math.random() * 12)
      : Math.round(20 + Math.random() * 160);

  return { outcome, durationSeconds, errorMessage };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
