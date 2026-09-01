import { NextRequest, NextResponse } from "next/server";
import { requireSpotifyUser } from "@/lib/auth";
import { broadcastCachedRoomState } from "@/lib/game-engine";
import { db } from "@/lib/db";
import { getDevices, getSpotifyProfile, getValidAccessToken } from "@/lib/spotify";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireSpotifyUser(request);
    const { code } = await context.params;
    const roomCode = code.toUpperCase();

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.hostUserId !== user.id) {
      return NextResponse.json({ error: "Only the host can start the game" }, { status: 403 });
    }

    const accessToken = await getValidAccessToken(user.id);
    const profile = await getSpotifyProfile(accessToken);

    if (profile.product !== "premium") {
      return NextResponse.json(
        {
          error: "Spotify Premium is required on the host account to control playback.",
        },
        { status: 400 },
      );
    }

    const devices = await getDevices(accessToken);
    if (devices.length === 0) {
      return NextResponse.json(
        {
          error: "No active Spotify device found. Open Spotify on a phone, desktop, or speaker first.",
        },
        { status: 400 },
      );
    }

    const activeDevice = devices.find((device) => device.is_active) ?? devices[0];

    await db.room.update({
      where: { id: room.id },
      data: {
        status: "playing",
        hostDeviceId: activeDevice.id,
      },
    });

    try {
      await broadcastCachedRoomState(roomCode);
    } catch (broadcastError) {
      console.warn("[start] Live broadcast failed:", broadcastError);
    }

    return NextResponse.json({
      ok: true,
      device: activeDevice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start game";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
