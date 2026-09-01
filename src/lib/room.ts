import { ROOM_CODE_CHARS } from "@/lib/constants";
import {
  buildActiveRound,
  buildReveal,
  canStartGuessRound,
  findCurrentGuessTrack,
  trackMatchesLive,
} from "@/lib/active-round";
import { db } from "@/lib/db";
import type { RoomStateView } from "@/lib/types";

export function generateRoomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export async function createUniqueRoomCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateRoomCode();
    const existing = await db.room.findUnique({ where: { code } });
    if (!existing) {
      return code;
    }
  }

  throw new Error("Unable to generate unique room code");
}

interface GetRoomStateOptions {
  liveSpotifyTrackId?: string | null;
  liveTrackUri?: string | null;
  liveNowPlaying?: {
    progressMs: number;
    durationMs: number;
    spotifyTrackId: string;
    trackName: string;
    artistName: string;
    albumArtUrl: string | null;
    isPlaying: boolean;
  } | null;
}

export async function getRoomState(
  code: string,
  currentUserId?: string | null,
  options: GetRoomStateOptions = {},
): Promise<RoomStateView | null> {
  const room = await db.room.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      members: {
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!room) {
    return null;
  }

  const gameTracks = await db.roomTrack.findMany({
    where: {
      roomId: room.id,
      revealedAt: null,
      status: { in: ["queued", "playing"] },
    },
    include: { addedBy: true },
    orderBy: { queuePosition: "asc" },
  });

  const airingTrack =
    room.status === "playing"
      ? await db.roomTrack.findFirst({
          where: {
            roomId: room.id,
            playingAt: { not: null },
            OR: [{ status: "playing" }, { status: "revealed", revealedAt: { not: null } }],
          },
          include: { addedBy: true },
          orderBy: { playingAt: "desc" },
        })
      : null;

  const liveSpotifyTrackId =
    options.liveSpotifyTrackId ?? options.liveNowPlaying?.spotifyTrackId ?? null;
  const liveTrackUri = options.liveTrackUri ?? null;

  const guessTrack = findCurrentGuessTrack(gameTracks, liveSpotifyTrackId, liveTrackUri);

  const queuedTracks = gameTracks
    .filter(
      (track) =>
        track.status === "queued" &&
        !trackMatchesLive(track, liveSpotifyTrackId, liveTrackUri),
    )
    .map((track) => ({
      id: track.id,
      trackName: track.trackName,
      artistName: track.artistName,
      albumArtUrl: track.albumArtUrl,
      status: "queued" as const,
      isPlayingNow: false,
    }));
  const queuedCount = gameTracks.filter((track) => track.status === "queued").length;

  const pendingRevealTrack =
    room.status === "playing"
      ? await db.roomTrack.findFirst({
          where: {
            roomId: room.id,
            revealedAt: { not: null },
          },
          include: { addedBy: true },
          orderBy: { revealedAt: "desc" },
        })
      : null;

  let activeRound = null;
  let reveal = null;

  if (guessTrack) {
    const guesses = await db.guess.findMany({
      where: { roomTrackId: guessTrack.id },
      include: { guesser: true, guessedUser: true },
    });

    if (canStartGuessRound(guessTrack, liveSpotifyTrackId, liveTrackUri)) {
      const liveTiming =
        options.liveNowPlaying &&
        trackMatchesLive(guessTrack, options.liveNowPlaying.spotifyTrackId, liveTrackUri)
          ? {
              progressMs: options.liveNowPlaying.progressMs,
              durationMs: options.liveNowPlaying.durationMs,
            }
          : null;

      activeRound = buildActiveRound(
        guessTrack,
        guesses,
        room.members,
        currentUserId,
        liveTiming,
      );
    }
  }

  if (pendingRevealTrack && !guessTrack) {
    const guesses = await db.guess.findMany({
      where: { roomTrackId: pendingRevealTrack.id },
      include: { guesser: true, guessedUser: true },
    });

    reveal = buildReveal(
      pendingRevealTrack,
      guesses,
      room.members,
      room.hostUserId,
      currentUserId,
    );
  }

  let nowPlaying = null;
  const liveNowPlaying = options.liveNowPlaying;

  if (room.status === "playing") {
    if (liveNowPlaying) {
      nowPlaying = {
        spotifyTrackId: liveNowPlaying.spotifyTrackId,
        trackName: liveNowPlaying.trackName,
        artistName: liveNowPlaying.artistName,
        albumArtUrl: liveNowPlaying.albumArtUrl,
        progressMs: liveNowPlaying.progressMs,
        durationMs: liveNowPlaying.durationMs,
        isPlaying: liveNowPlaying.isPlaying,
      };
    } else if (airingTrack) {
      nowPlaying = {
        spotifyTrackId: airingTrack.spotifyTrackId,
        trackName: airingTrack.trackName,
        artistName: airingTrack.artistName,
        albumArtUrl: airingTrack.albumArtUrl,
        progressMs: 0,
        durationMs: 0,
        isPlaying: true,
      };
    } else if (guessTrack && (guessTrack.status === "playing" || guessTrack.playingAt)) {
      nowPlaying = {
        spotifyTrackId: guessTrack.spotifyTrackId,
        trackName: guessTrack.trackName,
        artistName: guessTrack.artistName,
        albumArtUrl: guessTrack.albumArtUrl,
        progressMs: 0,
        durationMs: 0,
        isPlaying: true,
      };
    }
  }

  return {
    code: room.code,
    status: room.status as RoomStateView["status"],
    hostUserId: room.hostUserId,
    hostDeviceId: room.hostDeviceId,
    members: room.members.map((member) => ({
      id: member.user.id,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      isGuest: member.user.isGuest,
      score: member.score,
      isHost: member.userId === room.hostUserId,
    })),
    nowPlaying,
    queuedTracks,
    activeRound,
    reveal,
    tracksQueued: queuedCount,
    isCurrentUserHost: currentUserId === room.hostUserId,
    currentUserId: currentUserId ?? null,
  };
}
