import { NextResponse } from "next/server";
import { checkOllama, warmUp } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const status = await checkOllama();
  if (!status.ok) {
    return NextResponse.json(status, { status: 503 });
  }
  await warmUp();
  return NextResponse.json(status);
}
