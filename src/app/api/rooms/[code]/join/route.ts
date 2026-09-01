import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { broadcastRoomMembers } from "@/lib/game-engine";
import { db } from "@/lib/db";
import { getEnrichedRoomState } from "@/lib/room-state";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { code } = await context.params;
    const roomCode = code.toUpperCase();

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.status === "ended") {
      return NextResponse.json({ error: "This room has ended" }, { status: 400 });
    }

    await db.roomMember.upsert({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        roomId: room.id,
        userId: user.id,
      },
    });

    const state = await getEnrichedRoomState(roomCode, user.id);
    try {
      await broadcastRoomMembers(roomCode);
    } catch (broadcastError) {
      console.warn("[join] Live broadcast failed:", broadcastError);
    }

    return NextResponse.json({ room: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join room";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
