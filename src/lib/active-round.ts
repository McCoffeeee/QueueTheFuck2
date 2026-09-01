import { GUESS_OPEN_DELAY_MS, REVEAL_BEFORE_END_MS, SONG_END_PROGRESS_MS } from "@/lib/constants";
import type { ActiveRoundView, RevealGuessResult, RevealView } from "@/lib/types";

type GuessTrack = {
  id: string;
  spotifyTrackId: string;
  trackUri: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  addedByUserId: string;
  status: string;
  playingAt: Date | null;
  revealedAt: Date | null;
  addedBy: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

type GuessRecord = {
  guesserUserId: string;
  guessedUserId: string;
  isCorrect: boolean;
  points: number;
  guesser: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

type RoomMember = {
  userId: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    isGuest: boolean;
  };
  score: number;
};

export function trackMatchesLive(
  track: GuessTrack,
  liveSpotifyTrackId?: string | null,
  liveTrackUri?: string | null,
) {
  if (!liveSpotifyTrackId && !liveTrackUri) {
    return false;
  }

  return (
    (!!liveSpotifyTrackId && track.spotifyTrackId === liveSpotifyTrackId) ||
    (!!liveTrackUri && track.trackUri === liveTrackUri)
  );
}

export function findCurrentGuessTrack(
  tracks: GuessTrack[],
  liveSpotifyTrackId?: string | null,
  liveTrackUri?: string | null,
): GuessTrack | null {
  const unrevealed = tracks.filter((track) => !track.revealedAt);

  const activePlaying = unrevealed.find((track) => track.status === "playing");
  if (activePlaying) {
    return activePlaying;
  }

  if (liveSpotifyTrackId || liveTrackUri) {
    const liveMatch = unrevealed.find((track) =>
      trackMatchesLive(track, liveSpotifyTrackId, liveTrackUri),
    );
    if (liveMatch) {
      return liveMatch;
    }
  }

  return null;
}

export function isLiveTrackInGame(
  tracks: GuessTrack[],
  liveSpotifyTrackId?: string | null,
  liveTrackUri?: string | null,
) {
  return tracks.some(
    (track) => !track.revealedAt && trackMatchesLive(track, liveSpotifyTrackId, liveTrackUri),
  );
}

export function canStartGuessRound(
  track: GuessTrack,
  liveSpotifyTrackId?: string | null,
  liveTrackUri?: string | null,
) {
  if (track.revealedAt) {
    return false;
  }

  return (
    track.status === "playing" ||
    !!track.playingAt ||
    trackMatchesLive(track, liveSpotifyTrackId, liveTrackUri)
  );
}

export function buildActiveRound(
  track: GuessTrack,
  guesses: GuessRecord[],
  members: RoomMember[],
  currentUserId?: string | null,
  liveNowPlaying?: { progressMs: number; durationMs: number } | null,
): ActiveRoundView {
  const eligibleGuessers = members.filter((member) => member.userId !== track.addedByUserId);
  const userGuess = currentUserId
    ? guesses.find((guess) => guess.guesserUserId === currentUserId)
    : undefined;
  const isAdder = currentUserId === track.addedByUserId;

  const remainingMs =
    liveNowPlaying && liveNowPlaying.durationMs > 0
      ? Math.max(0, liveNowPlaying.durationMs - liveNowPlaying.progressMs)
      : 5 * 60 * 1000;

  const playingStartedAt = track.playingAt?.getTime() ?? Date.now();
  const guessOpensAt = new Date(playingStartedAt + GUESS_OPEN_DELAY_MS);
  const guessingIsOpen = Date.now() >= guessOpensAt.getTime();

  return {
    roomTrackId: track.id,
    spotifyTrackId: track.spotifyTrackId,
    trackName: track.trackName,
    artistName: track.artistName,
    albumArtUrl: track.albumArtUrl,
    guessEndsAt: new Date(Date.now() + remainingMs).toISOString(),
    guessOpensAt: guessOpensAt.toISOString(),
    guessesSubmitted: guesses.length,
    totalPlayers: eligibleGuessers.length,
    canGuess: !!currentUserId && !isAdder && !userGuess && guessingIsOpen,
    hasSubmitted: !!userGuess,
    submittedGuessUserId: userGuess?.guessedUserId ?? null,
    progressMs: liveNowPlaying?.progressMs,
    durationMs: liveNowPlaying?.durationMs,
  };
}

export function shouldRevealTrack(
  track: Pick<GuessTrack, "addedByUserId" | "playingAt" | "revealedAt">,
  guesses: Pick<GuessRecord, "guesserUserId">[],
  members: Pick<RoomMember, "userId">[],
  playback: { progressMs: number; durationMs: number } | null,
  options: { forceBecauseTrackEnded?: boolean } = {},
): boolean {
  if (!track.playingAt || track.revealedAt) {
    return false;
  }

  if (options.forceBecauseTrackEnded) {
    return true;
  }

  if (!playback || playback.durationMs <= 0) {
    return false;
  }

  const eligibleGuessers = members.filter((member) => member.userId !== track.addedByUserId);
  const allGuessed =
    eligibleGuessers.length > 0 && guesses.length >= eligibleGuessers.length;
  const msUntilEnd = playback.durationMs - playback.progressMs;

  if (msUntilEnd <= SONG_END_PROGRESS_MS) {
    return true;
  }

  if (allGuessed && msUntilEnd <= REVEAL_BEFORE_END_MS) {
    return true;
  }

  return false;
}

function resolveRevealGuessResult(
  track: GuessTrack,
  guesses: GuessRecord[],
  currentUserId?: string | null,
): RevealGuessResult {
  if (!currentUserId) {
    return "no_guess";
  }

  if (currentUserId === track.addedByUserId) {
    return "adder";
  }

  const userGuess = guesses.find((guess) => guess.guesserUserId === currentUserId);
  if (!userGuess) {
    return "no_guess";
  }

  return userGuess.isCorrect ? "correct" : "wrong";
}

export function buildReveal(
  track: GuessTrack,
  guesses: GuessRecord[],
  members: RoomMember[],
  hostUserId: string,
  currentUserId?: string | null,
): RevealView {
  const correctGuessers = guesses
    .filter((guess) => guess.isCorrect)
    .map((guess) => ({
      id: guess.guesser.id,
      displayName: guess.guesser.displayName,
      avatarUrl: guess.guesser.avatarUrl,
    }));

  const pointsAwarded = guesses
    .filter((guess) => guess.points > 0)
    .map((guess) => ({
      userId: guess.guesserUserId,
      displayName: guess.guesser.displayName,
      avatarUrl: guess.guesser.avatarUrl,
      points: guess.points,
    }));

  return {
    roomTrackId: track.id,
    spotifyTrackId: track.spotifyTrackId,
    trackName: track.trackName,
    artistName: track.artistName,
    albumArtUrl: track.albumArtUrl,
    addedBy: {
      id: track.addedBy.id,
      displayName: track.addedBy.displayName,
      avatarUrl: track.addedBy.avatarUrl,
    },
    yourResult: resolveRevealGuessResult(track, guesses, currentUserId),
    yourPoints: currentUserId
      ? (guesses.find((guess) => guess.guesserUserId === currentUserId)?.points ?? 0)
      : 0,
    correctGuessers,
    pointsAwarded,
    scores: members.map((member) => ({
      id: member.user.id,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      isGuest: member.user.isGuest,
      score: member.score,
      isHost: member.userId === hostUserId,
    })),
  };
}
