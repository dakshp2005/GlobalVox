import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processCampaignBatch } from "@/lib/campaignEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/campaigns/[id]/process">
) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const result = await processCampaignBatch(id);

  if (result.remaining === 0) {
    await prisma.campaign.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
  }

  return NextResponse.json({ ...result, done: result.remaining === 0 });
}
