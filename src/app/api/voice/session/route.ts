import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, openingLine } from "@/lib/rsvpAgent";
import { isAgentVoice, type AgentVoice } from "@/lib/agentPrompt";
import { isLang, type Lang } from "@/lib/voiceLines";

export const dynamic = "force-dynamic";

/**
 * POST { inviteeId, lang, gender? } -> everything the local voice server needs to run one
 * call: the agent's instructions (the campaign's editable prompt plus the fixed call rules),
 * the greeting, the starting language and the voice. The browser passes it to the voice
 * server when it opens the call.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    inviteeId?: string;
    lang?: string;
    gender?: string;
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

  const { campaign } = invitee;
  const ctx = {
    inviteeName: invitee.name,
    eventName: campaign.eventName,
    eventDate: campaign.eventDate,
    eventLocation: campaign.eventLocation,
    campaignName: campaign.campaignName,
    eventTime: campaign.eventTime,
    venueDetails: campaign.venueDetails,
    faqNotes: campaign.faqNotes,
  };
  const lang: Lang = isLang(body.lang) ? body.lang : "en-IN";
  const gender: AgentVoice = isAgentVoice(body.gender)
    ? body.gender
    : isAgentVoice(campaign.agentVoice)
      ? campaign.agentVoice
      : "female";

  return NextResponse.json({
    type: "start",
    lang,
    gender,
    opening: openingLine(ctx, lang, gender),
    systemPrompt: buildSystemPrompt(ctx, { lang, gender, template: campaign.agentPrompt }),
  });
}
