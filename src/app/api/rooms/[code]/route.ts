import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRoomState } from "@/lib/room";
import { getEnrichedRoomState } from "@/lib/room-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const user = await getCurrentUser(request);

    let state = null;
    try {
      state = await getEnrichedRoomState(code, user?.id);
    } catch (enrichError) {
      console.warn(`[rooms] Enriched state failed for ${code}:`, enrichError);
      state = await getRoomState(code, user?.id);
    }

    if (!state) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json(
      { room: state },
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[rooms] GET failed:", error);
    return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
  }
}
