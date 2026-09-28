import type { CallOutcome, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextInviteeStatus } from "@/lib/campaignEngine";

export interface RecordCallInput {
  outcome: CallOutcome;
  summary: string;
  transcript: unknown[];
  durationSeconds: number;
  /** When the call really ended (offline calls sync later). Defaults to now. */
  endedAt?: Date;
}

/**
 * Stores one finished call (attempt + transcript), updates the invitee's status
 * with the shared retry rules and completes the campaign when nothing is left.
 * Used by both the AI (Ollama) call route and the offline-sync route.
 */
export async function recordCall(
  invitee: { id: string; campaignId: string; attemptCount: number },
  input: RecordCallInput
) {
  const endedAt = input.endedAt ?? new Date();
  const attemptNumber = invitee.attemptCount + 1;
  const durationSeconds = Math.max(0, Math.round(input.durationSeconds));

  await prisma.$transaction([
    prisma.callAttempt.create({
      data: {
        inviteeId: invitee.id,
        attemptNumber,
        startedAt: new Date(endedAt.getTime() - durationSeconds * 1000),
        endedAt,
        durationSeconds,
        outcome: input.outcome,
        errorMessage: input.outcome === "NO_ANSWER" ? "No response from invitee" : null,
        transcript: input.transcript as unknown as Prisma.InputJsonValue,
        summary: input.summary,
      },
    }),
    prisma.invitee.update({
      where: { id: invitee.id },
      data: {
        status: nextInviteeStatus(input.outcome, attemptNumber),
        attemptCount: attemptNumber,
      },
    }),
  ]);

  const pending = await prisma.invitee.count({
    where: { campaignId: invitee.campaignId, status: { in: ["PENDING", "IN_PROGRESS"] } },
  });
  if (pending === 0) {
    await prisma.campaign.update({
      where: { id: invitee.campaignId },
      data: { status: "COMPLETED" },
    });
  }
}
