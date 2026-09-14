import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/campaigns/[id]">
) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const grouped = await prisma.invitee.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: true,
  });
  const stats = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  const total = grouped.reduce((sum, g) => sum + g._count, 0);

  const url = new URL(_req.url);
  const statusFilter = url.searchParams.get("status");
  const search = url.searchParams.get("search")?.trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = 25;

  const where = {
    campaignId: id,
    ...(statusFilter ? { status: statusFilter as never } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [invitees, filteredCount] = await Promise.all([
    prisma.invitee.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invitee.count({ where }),
  ]);

  return NextResponse.json({
    campaign,
    stats,
    total,
    invitees,
    pagination: { page, pageSize, filteredCount },
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/campaigns/[id]">
) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { eventName, eventDate, eventLocation, campaignName } = body;
  if (!eventName || !eventDate || !eventLocation || !campaignName) {
    return NextResponse.json(
      {
        error:
          "eventName, eventDate, eventLocation and campaignName are all required",
      },
      { status: 400 }
    );
  }

  const parsedDate = new Date(eventDate);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "Invalid eventDate" }, { status: 400 });
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { eventName, eventDate: parsedDate, eventLocation, campaignName },
  });

  return NextResponse.json({ campaign: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/campaigns/[id]">
) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  await prisma.campaign.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
