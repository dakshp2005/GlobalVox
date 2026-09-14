import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/campaigns/[id]/export">
) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const invitees = await prisma.invitee.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "id",
    "name",
    "phone",
    "email",
    "status",
    "attempt_count",
    "invalid_reason",
  ];
  const rows = invitees.map((inv) =>
    [
      inv.externalId ?? "",
      inv.name,
      inv.phone,
      inv.email ?? "",
      inv.status,
      String(inv.attemptCount),
      inv.invalidReason ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  const safeName = campaign.campaignName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName || "campaign"}-results.csv"`,
    },
  });
}
