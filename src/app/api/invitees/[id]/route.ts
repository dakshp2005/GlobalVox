import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/invitees/[id]">
) {
  const { id } = await ctx.params;

  const invitee = await prisma.invitee.findUnique({
    where: { id },
    include: {
      campaign: true,
      callAttempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  if (!invitee) {
    return NextResponse.json({ error: "Invitee not found" }, { status: 404 });
  }

  return NextResponse.json({ invitee });
}
