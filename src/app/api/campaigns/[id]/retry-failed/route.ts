import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/campaigns/[id]/retry-failed">
) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { count } = await prisma.invitee.updateMany({
    where: { campaignId: id, status: "FAILED" },
    data: { status: "PENDING", attemptCount: 0 },
  });

  if (count > 0 && campaign.status === "COMPLETED") {
    await prisma.campaign.update({
      where: { id },
      data: { status: "RUNNING" },
    });
  }

  return NextResponse.json({ retried: count });
}
