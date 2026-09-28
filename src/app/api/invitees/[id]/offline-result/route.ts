import { NextResponse } from "next/server";
import type { CallOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordCall } from "@/lib/callRecorder";

export const dynamic = "force-dynamic";

const OUTCOMES: CallOutcome[] = ["CONFIRMED", "DECLINED", "UNDECIDED", "NO_ANSWER"];

interface Body {
  outcome?: string;
  summary?: string;
  transcript?: { role?: string; content?: string }[];
  durationSeconds?: number;
  endedAt?: string;
}

/**
 * POST -> receives the result of a call that ran fully on the user's device
 * (offline mode). No AI model is involved: the device already decided the
 * outcome, this just stores it. Safe to retry: the same endedAt is stored once.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/invitees/[id]/offline-result">
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;

  if (!body || !OUTCOMES.includes(body.outcome as CallOutcome)) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }
  const transcript = Array.isArray(body.transcript) ? body.transcript.slice(0, 40) : [];
  const validTranscript = transcript.every(
    (t) =>
      (t.role === "agent" || t.role === "user") &&
      typeof t.content === "string" &&
      t.content.length <= 1000
  );
  if (!validTranscript) {
    return NextResponse.json({ error: "Invalid transcript" }, { status: 400 });
  }
  const endedAt = body.endedAt ? new Date(body.endedAt) : undefined;
  if (endedAt && Number.isNaN(endedAt.getTime())) {
    return NextResponse.json({ error: "Invalid endedAt" }, { status: 400 });
  }

  const invitee = await prisma.invitee.findUnique({ where: { id } });
  if (!invitee) {
    return NextResponse.json({ error: "Invitee not found" }, { status: 404 });
  }
  if (invitee.status === "INVALID") {
    return NextResponse.json({ error: "This invitee cannot be called." }, { status: 400 });
  }

  // Already synced (a retry after a lost response)? Treat as success.
  if (endedAt) {
    const existing = await prisma.callAttempt.findFirst({
      where: { inviteeId: id, endedAt },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, duplicate: true });
  }

  await recordCall(invitee, {
    outcome: body.outcome as CallOutcome,
    summary: String(body.summary ?? "").slice(0, 300),
    transcript,
    durationSeconds: Number(body.durationSeconds) || 0,
    endedAt,
  });
  return NextResponse.json({ ok: true });
}
