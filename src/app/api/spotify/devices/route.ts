import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { requireSpotifyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDevices, getValidAccessToken } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSpotifyUser(request);
    const roomCode = request.nextUrl.searchParams.get("room")?.toUpperCase();

    let hostUserId = user.id;
    if (roomCode) {
      const room = await db.room.findUnique({ where: { code: roomCode } });
      if (!room) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
      if (room.hostUserId !== user.id) {
        return NextResponse.json({ error: "Only the host can list devices" }, { status: 403 });
      }
      hostUserId = room.hostUserId;
    }

    const accessToken = await getValidAccessToken(hostUserId);
    const devices = await getDevices(accessToken);

    return NextResponse.json({ devices });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch devices";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
