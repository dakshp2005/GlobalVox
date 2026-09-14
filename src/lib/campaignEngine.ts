import type { InviteeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { simulateCall } from "@/lib/callSimulator";

export const MAX_ATTEMPTS = 3;
export const BATCH_SIZE = 25;

/**
 * Processes one batch of not-yet-resolved invitees for a campaign through
 * the simulated calling service. Designed to run within a single serverless
 * request: at real-world scale (10k-100k+ invitees) this would instead be
 * driven by a durable job queue (e.g. QStash/SQS/BullMQ) fanning out workers
 * with rate limiting and backoff, rather than client-driven batch polling.
 */
export async function processCampaignBatch(campaignId: string) {
  const invitees = await prisma.invitee.findMany({
    where: {
      campaignId,
      status: { in: ["PENDING"] },
    },
    take: BATCH_SIZE,
  });

  if (invitees.length === 0) {
    const remaining = await prisma.invitee.count({
      where: { campaignId, status: "PENDING" },
    });
    return { processed: 0, remaining };
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

      const resolved =
        result.outcome === "CONFIRMED" ||
        result.outcome === "DECLINED" ||
        result.outcome === "UNDECIDED";

      const exhaustedRetries = attemptNumber >= MAX_ATTEMPTS;

      const nextStatus: InviteeStatus = resolved
        ? (result.outcome as InviteeStatus)
        : exhaustedRetries
          ? "FAILED"
          : "PENDING"; // retried in a later batch

      await prisma.invitee.update({
        where: { id: invitee.id },
        data: {
          status: nextStatus,
          attemptCount: attemptNumber,
        },
      });
    })
  );

  const remaining = await prisma.invitee.count({
    where: { campaignId, status: "PENDING" },
  });

  return { processed: invitees.length, remaining };
}
