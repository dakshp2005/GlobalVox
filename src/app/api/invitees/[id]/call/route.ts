import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordCall } from "@/lib/callRecorder";
import { OllamaError } from "@/lib/ollama";
import { classifyRsvp, type TranscriptTurn } from "@/lib/rsvpAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { messages, durationSeconds } -> ends a voice call: classifies the
 * transcript, records a CallAttempt and updates the invitee's status.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/invitees/[id]/call">
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    messages?: TranscriptTurn[];
    durationSeconds?: number;
  } | null;

  const invitee = await prisma.invitee.findUnique({ where: { id } });
  if (!invitee) {
    return NextResponse.json({ error: "Invitee not found" }, { status: 404 });
  }
  if (invitee.status === "INVALID") {
    return NextResponse.json(
      { error: "This invitee cannot be called." },
      { status: 400 }
    );
  }

  const transcript = (body?.messages ?? [])
    .filter((m) => m.content.trim())
    .map(({ role, content }) => ({ role, content })); // the model's raw text isn't worth storing
  let result;
  try {
    result = await classifyRsvp(transcript);
  } catch (e) {
    const message = e instanceof OllamaError ? e.message : "Could not analyse the call.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await recordCall(invitee, {
    outcome: result.outcome,
    summary: result.summary,
    transcript,
    durationSeconds: body?.durationSeconds ?? 0,
    callbackAt: result.callbackAt,
  });

  return NextResponse.json({
    outcome: result.outcome,
    summary: result.summary,
    callbackAt: result.callbackAt?.toISOString() ?? null,
  });
}
