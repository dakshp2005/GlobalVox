import type { CallOutcome, InviteeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { simulateCall } from "@/lib/callSimulator";

export const MAX_ATTEMPTS = 3;
export const BATCH_SIZE = 25;

/**
 * Decides an invitee's status after a call attempt: usable answers are
 * terminal, a requested callback waits for its time (and doesn't use up an
 * attempt's worth of retries), anything else is retried until MAX_ATTEMPTS,
 * then FAILED.
 */
export function nextInviteeStatus(
  outcome: CallOutcome,
  attemptNumber: number
): InviteeStatus {
  if (
    outcome === "CONFIRMED" ||
    outcome === "DECLINED" ||
    outcome === "UNDECIDED"
  ) {
    return outcome;
  }
  if (outcome === "CALLBACK_REQUESTED") return "CALLBACK";
  return attemptNumber >= MAX_ATTEMPTS ? "FAILED" : "PENDING";
}

/** Invitees waiting to be called: never called yet, or a callback whose time has come. */
export function dueForCallWhere(campaignId: string, now = new Date()): Prisma.InviteeWhereInput {
  return {
    campaignId,
    OR: [{ status: "PENDING" }, { status: "CALLBACK", callbackAt: { lte: now } }],
  };
}

/**
 * Processes one batch of not-yet-resolved invitees for a campaign through
 * the simulated calling service. Designed to run within a single serverless
 * request: at real-world scale (10k-100k+ invitees) this would instead be
 * driven by a durable job queue (e.g. QStash/SQS/BullMQ) fanning out workers
 * with rate limiting and backoff, rather than client-driven batch polling.
 */
export async function processCampaignBatch(campaignId: string) {
  const invitees = await prisma.invitee.findMany({
    where: dueForCallWhere(campaignId),
    take: BATCH_SIZE,
  });

  if (invitees.length === 0) {
    return { processed: 0, remaining: 0, scheduled: await countScheduled(campaignId) };
  }

  await prisma.invitee.updateMany({
    where: { id: { in: invitees.map((i) => i.id) } },
    data: { status: "IN_PROGRESS" },
  });

  await Promise.all(
    invitees.map(async (invitee) => {
      const attemptNumber = invitee.attemptCount + 1;
      const result = await simulateCall();

      await prisma.callAttempt.create({
        data: {
          inviteeId: invitee.id,
          attemptNumber,
          endedAt: new Date(),
          durationSeconds: result.durationSeconds,
          outcome: result.outcome,
          errorMessage: result.errorMessage,
        },
      });

      const nextStatus = nextInviteeStatus(result.outcome, attemptNumber);

      await prisma.invitee.update({
        where: { id: invitee.id },
        data: {
          status: nextStatus,
          attemptCount: attemptNumber,
          callbackAt: null,
        },
      });
    })
  );

  const remaining = await prisma.invitee.count({ where: dueForCallWhere(campaignId) });

  return { processed: invitees.length, remaining, scheduled: await countScheduled(campaignId) };
}

/** Callbacks booked for later; they keep the campaign open but aren't due yet. */
function countScheduled(campaignId: string) {
  return prisma.invitee.count({
    where: { campaignId, status: "CALLBACK", callbackAt: { gt: new Date() } },
  });
}
