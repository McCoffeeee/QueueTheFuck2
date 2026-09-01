import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { handleMemberLeave } from "@/lib/room-lifecycle";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { code } = await context.params;
    const roomCode = code.toUpperCase();

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const membership = await db.roomMember.findFirst({
      where: {
        roomId: room.id,
        userId: user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ ok: true });
    }

    await handleMemberLeave(roomCode, user.id, { immediateHostClose: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to leave room";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
