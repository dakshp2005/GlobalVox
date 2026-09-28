import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OllamaError, streamChat } from "@/lib/ollama";
import {
  buildSystemPrompt,
  openingLine,
  toChatMessages,
  type TranscriptTurn,
} from "@/lib/rsvpAgent";
import { isLang, type Lang } from "@/lib/voiceLines";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_USER_TURNS = 4;

/**
 * POST { inviteeId, messages } -> streams the agent's next reply as text.
 * With no messages, returns the fixed opening line (no model call needed).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    inviteeId?: string;
    messages?: TranscriptTurn[];
    lang?: string;
  } | null;
  if (!body?.inviteeId) {
    return NextResponse.json({ error: "inviteeId is required" }, { status: 400 });
  }

  const invitee = await prisma.invitee.findUnique({
    where: { id: body.inviteeId },
    include: { campaign: true },
  });
  if (!invitee) {
    return NextResponse.json({ error: "Invitee not found" }, { status: 404 });
  }
  if (invitee.status === "INVALID") {
    return NextResponse.json(
      { error: "This invitee has invalid contact data and cannot be called." },
      { status: 400 }
    );
  }

  const ctx = {
    inviteeName: invitee.name,
    eventName: invitee.campaign.eventName,
    eventDate: invitee.campaign.eventDate,
    eventLocation: invitee.campaign.eventLocation,
    campaignName: invitee.campaign.campaignName,
  };

  const lang: Lang = isLang(body.lang) ? body.lang : "en-IN";
  const messages = (body.messages ?? []).slice(-20);
  if (messages.length === 0) {
    return new Response(openingLine(ctx, lang), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    // Guarantee the call ends: after a few exchanges, force the closing lines.
    const userTurns = messages.filter((m) => m.role === "user").length;
    const stream = await streamChat(
      toChatMessages(buildSystemPrompt(ctx, lang, userTurns >= MAX_USER_TURNS), messages)
    );
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof OllamaError ? e.message : "Voice agent failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
