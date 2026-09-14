import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInviteeCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/campaigns/[id]/invitees">
) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const csvText: string | undefined = body?.csvText;
  if (!csvText) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  const { rows, parseErrors } = parseInviteeCsv(csvText);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No invitee rows found in the CSV", parseErrors },
      { status: 400 }
    );
  }

  const existing = await prisma.invitee.findMany({
    where: { campaignId: id },
    select: { phone: true },
  });
  const existingPhones = new Set(existing.map((e) => e.phone));

  const finalRows = rows.map((r) => {
    if (r.valid && existingPhones.has(r.phone)) {
      return {
        ...r,
        valid: false,
        invalidReason: "duplicate phone in campaign",
      };
    }
    if (r.valid) existingPhones.add(r.phone);
    return r;
  });

  const CHUNK = 1000;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < finalRows.length; i += CHUNK) {
    const chunk = finalRows.slice(i, i + CHUNK);
    await prisma.invitee.createMany({
      data: chunk.map((r) => ({
        campaignId: id,
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

  if (validCount > 0 && campaign.status === "COMPLETED") {
    await prisma.campaign.update({
      where: { id },
      data: { status: "RUNNING" },
    });
  }

  return NextResponse.json({
    importSummary: {
      totalRows: finalRows.length,
      valid: validCount,
      invalid: invalidCount,
      parseErrors,
    },
  });
}
