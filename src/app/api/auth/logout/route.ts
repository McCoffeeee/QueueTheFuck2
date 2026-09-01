import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  destroySession(response);
  return response;
}
