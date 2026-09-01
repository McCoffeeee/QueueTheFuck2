import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { broadcastCachedRoomState } from "@/lib/game-engine";
import { invalidateRoom } from "@/lib/playback-cache";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { code } = await context.params;
    const roomCode = code.toUpperCase();
    const { deviceId } = (await request.json()) as { deviceId?: string };

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
    }

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.hostUserId !== user.id) {
      return NextResponse.json({ error: "Only the host can select a device" }, { status: 403 });
    }

    await db.room.update({
      where: { id: room.id },
      data: { hostDeviceId: deviceId },
    });

    invalidateRoom(room.id);

    try {
      await broadcastCachedRoomState(roomCode);
    } catch (broadcastError) {
      console.warn("[device] Live broadcast failed:", broadcastError);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update device";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
