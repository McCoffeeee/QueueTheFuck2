import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { requireSpotifyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCachedRoomPlayback, invalidateRoom } from "@/lib/playback-cache";
import { getValidAccessToken, playbackControl } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSpotifyUser(request);
    const roomCode = request.nextUrl.searchParams.get("room")?.toUpperCase();

    if (!roomCode) {
      return NextResponse.json({ error: "room is required" }, { status: 400 });
    }

    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.hostUserId !== user.id) {
      return NextResponse.json({ error: "Only the host can view playback" }, { status: 403 });
    }

    const cached = getCachedRoomPlayback(room.id);
    if (!cached.liveNowPlaying) {
      return NextResponse.json({ nowPlaying: null });
    }

    const live = cached.liveNowPlaying;
    return NextResponse.json({
      nowPlaying: {
        spotifyTrackId: live.spotifyTrackId,
        trackName: live.trackName,
        artistName: live.artistName,
        albumArtUrl: live.albumArtUrl,
        progressMs: live.progressMs,
        durationMs: live.durationMs,
        isPlaying: live.isPlaying,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch playback";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSpotifyUser(request);
    const { room, action } = (await request.json()) as {
      room?: string;
      action?: "play" | "pause" | "next" | "previous";
    };

    if (!room || !action) {
      return NextResponse.json({ error: "room and action are required" }, { status: 400 });
    }

    const roomCode = room.toUpperCase();
    const dbRoom = await db.room.findUnique({ where: { code: roomCode } });
    if (!dbRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (dbRoom.hostUserId !== user.id) {
      return NextResponse.json({ error: "Only the host can control playback" }, { status: 403 });
    }

    invalidateRoom(dbRoom.id);

    const accessToken = await getValidAccessToken(dbRoom.hostUserId);
    await playbackControl(accessToken, action, dbRoom.hostDeviceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playback control failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
