import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { GUESS_OPEN_DELAY_MS } from "@/lib/constants";
import {
  broadcastCachedRoomState,
  ensureRoundForLiveTrack,
  scheduleRevealForTrack,
} from "@/lib/game-engine";
import { getCachedRoomPlayback } from "@/lib/playback-cache";
import { getPlayerPlayback, getValidAccessToken } from "@/lib/spotify";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { code } = await context.params;
    const roomCode = code.toUpperCase();
    const { roomTrackId, guessedUserId } = (await request.json()) as {
      roomTrackId?: string;
      guessedUserId?: string;
    };

    if (!roomTrackId || !guessedUserId) {
      return NextResponse.json({ error: "roomTrackId and guessedUserId are required" }, { status: 400 });
    }

    const room = await db.room.findUnique({
      where: { code: roomCode },
      include: { members: true },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    let track = await db.roomTrack.findUnique({ where: { id: roomTrackId } });
    if (!track || track.roomId !== room.id) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    if (track.revealedAt) {
      return NextResponse.json({ error: "No active guessing round" }, { status: 400 });
    }

    if (track.status === "queued") {
      try {
        const hostToken = await getValidAccessToken(room.hostUserId);
        const playback = await getPlayerPlayback(hostToken, room.hostDeviceId, room.id);
        const isLive =
          playback?.item?.id === track.spotifyTrackId ||
          playback?.item?.uri === track.trackUri;
        if (isLive) {
          await ensureRoundForLiveTrack(
            room.id,
            roomCode,
            track.spotifyTrackId,
            track.trackUri,
          );
          track = await db.roomTrack.findUnique({ where: { id: roomTrackId } });
        }
      } catch {
        // Fall through to status check
      }
    }

    if (!track || track.status !== "playing") {
      return NextResponse.json({ error: "No active guessing round" }, { status: 400 });
    }

    const guessOpensAt = (track.playingAt?.getTime() ?? Date.now()) + GUESS_OPEN_DELAY_MS;
    if (Date.now() < guessOpensAt) {
      return NextResponse.json({ error: "Guessing opens soon — listen first!" }, { status: 400 });
    }

    if (track.addedByUserId === user.id) {
      return NextResponse.json({ error: "You cannot guess your own song" }, { status: 400 });
    }

    if (guessedUserId === user.id) {
      return NextResponse.json({ error: "You cannot guess yourself" }, { status: 400 });
    }

    const isMember = room.members.some((member) => member.userId === user.id);
    if (!isMember) {
      return NextResponse.json({ error: "You are not in this room" }, { status: 403 });
    }

    const guessedIsMember = room.members.some((member) => member.userId === guessedUserId);
    if (!guessedIsMember) {
      return NextResponse.json({ error: "Invalid guess target" }, { status: 400 });
    }

    const isCorrect = guessedUserId === track.addedByUserId;

    await db.guess.upsert({
      where: {
        roomTrackId_guesserUserId: {
          roomTrackId,
          guesserUserId: user.id,
        },
      },
      update: {
        guessedUserId,
        isCorrect,
      },
      create: {
        roomTrackId,
        guesserUserId: user.id,
        guessedUserId,
        isCorrect,
      },
    });

    await broadcastCachedRoomState(roomCode);

    const cached = getCachedRoomPlayback(room.id);
    const live = cached.liveNowPlaying;
    if (
      live &&
      (live.spotifyTrackId === track.spotifyTrackId || live.trackUri === track.trackUri)
    ) {
      await scheduleRevealForTrack(roomTrackId, {
        progressMs: live.progressMs,
        durationMs: live.durationMs,
      });
    }

    return NextResponse.json({ ok: true, isCorrect: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit guess";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
