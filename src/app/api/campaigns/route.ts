import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInviteeCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { invitees: true } },
    },
  });

  const withStats = await Promise.all(
    campaigns.map(async (c) => {
      const grouped = await prisma.invitee.groupBy({
        by: ["status"],
        where: { campaignId: c.id },
        _count: true,
      });
      const stats = Object.fromEntries(
        grouped.map((g) => [g.status, g._count])
      );
      return { ...c, stats, total: c._count.invitees };
    })
  );

  return NextResponse.json({ campaigns: withStats });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { eventName, eventDate, eventLocation, campaignName, csvText } = body;

  if (!eventName || !eventDate || !eventLocation || !campaignName || !csvText) {
    return NextResponse.json(
      {
        error:
          "eventName, eventDate, eventLocation, campaignName and csvText are all required",
      },
      { status: 400 }
    );
  }

  const parsedDate = new Date(eventDate);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "Invalid eventDate" }, { status: 400 });
  }

  const { rows, parseErrors } = parseInviteeCsv(csvText);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No invitee rows found in the CSV", parseErrors },
      { status: 400 }
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      eventName,
      eventDate: parsedDate,
      eventLocation,
      campaignName,
    },
  });

  const CHUNK = 1000;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.invitee.createMany({
      data: chunk.map((r) => ({
        campaignId: campaign.id,
        externalId: r.externalId,
        name: r.name,
        phone: r.phone,
        email: r.email,
        status: r.valid ? "PENDING" : "INVALID",
        invalidReason: r.invalidReason,
      })),
    });
    validCount += chunk.filter((r) => r.valid).length;
    invalidCount += chunk.filter((r) => !r.valid).length;
  }

  return NextResponse.json({
    campaign,
    importSummary: {
      totalRows: rows.length,
      valid: validCount,
      invalid: invalidCount,
      parseErrors,
    },
  });
}
