import { NextRequest, NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth";

import {
  broadcastCachedRoomState,
  getHeadQueuedTrack,
  requestSpotifyHeadQueueSync,
  startRoundForTrack,
} from "@/lib/game-engine";

import { invalidateRoom } from "@/lib/playback-cache";

import { shuffleQueueTail } from "@/lib/queue-shuffle";

import { getRoomState } from "@/lib/room";

import { buildRoomStateFromCache } from "@/lib/room-state";

import { db } from "@/lib/db";

import { getPlayerPlayback, getValidAccessToken, startPlayback } from "@/lib/spotify";



export const runtime = "nodejs";

export const dynamic = "force-dynamic";



export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {

  try {

    const user = await requireCurrentUser(request);

    const { code } = await context.params;

    const roomCode = code.toUpperCase();

    const body = (await request.json()) as {

      spotifyTrackId?: string;

      trackUri?: string;

      trackName?: string;

      artistName?: string;

      albumArtUrl?: string | null;

    };



    const { spotifyTrackId, trackUri, trackName, artistName, albumArtUrl } = body;

    if (!spotifyTrackId || !trackUri || !trackName || !artistName) {

      return NextResponse.json({ error: "Missing track details" }, { status: 400 });

    }



    const room = await db.room.findUnique({

      where: { code: roomCode },

      include: { members: true },

    });



    if (!room) {

      return NextResponse.json({ error: "Room not found" }, { status: 404 });

    }



    if (room.status !== "playing") {

      return NextResponse.json({ error: "Game has not started yet" }, { status: 400 });

    }



    const isMember = room.members.some((member) => member.userId === user.id);

    if (!isMember) {

      return NextResponse.json({ error: "You are not in this room" }, { status: 403 });

    }



    const maxPosition = await db.roomTrack.aggregate({

      where: {

        roomId: room.id,

        revealedAt: null,

        status: { in: ["queued", "playing"] },

      },

      _max: { queuePosition: true },

    });



    const track = await db.roomTrack.create({

      data: {

        roomId: room.id,

        spotifyTrackId,

        trackUri,

        trackName,

        artistName,

        albumArtUrl: albumArtUrl ?? null,

        addedByUserId: user.id,

        queuePosition: (maxPosition._max.queuePosition ?? -1) + 1,

      },

    });



    await shuffleQueueTail(room.id);



    let spotifyWarning: string | null = null;



    try {

      invalidateRoom(room.id);

      const hostToken = await getValidAccessToken(room.hostUserId);

      const currentlyPlaying = await getPlayerPlayback(hostToken, room.hostDeviceId, room.id);

      const startedPlayback = !currentlyPlaying?.item;



      if (startedPlayback) {

        const head = await getHeadQueuedTrack(room.id);

        if (head) {

          await startPlayback(hostToken, head.trackUri, room.hostDeviceId);

          await startRoundForTrack(head.id, roomCode);

        }

      } else if (currentlyPlaying?.item) {

        void requestSpotifyHeadQueueSync(room.id);

      }

    } catch (spotifyError) {

      spotifyWarning =

        spotifyError instanceof Error

          ? spotifyError.message

          : "Song saved to the game but Spotify playback failed";

      console.warn("[tracks] Spotify playback failed:", spotifyError);

    }



    try {

      await broadcastCachedRoomState(roomCode);

    } catch (broadcastError) {

      console.warn("[tracks] Live broadcast failed:", broadcastError);

    }



    const roomState = (await buildRoomStateFromCache(roomCode, user.id)) ?? (await getRoomState(roomCode, user.id));



    return NextResponse.json(

      {

        ok: true,

        message: spotifyWarning

          ? "Song added to the game queue, but Spotify playback failed"

          : "Song added to the queue",

        spotifyWarning,

        tracksQueued: roomState?.tracksQueued ?? 0,

        room: roomState,

      },

      { headers: { "Content-Type": "application/json" } },

    );

  } catch (error) {

    const message = error instanceof Error ? error.message : "Failed to add track";

    const status = message === "Unauthorized" ? 401 : 500;

    return NextResponse.json({ error: message }, { status });

  }

}

