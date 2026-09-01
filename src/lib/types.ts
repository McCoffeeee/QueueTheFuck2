export type RoomStatus = "lobby" | "playing" | "ended";
export type TrackStatus = "queued" | "playing" | "revealed";

export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest?: boolean;
}

export interface RoomMemberView extends PublicUser {
  score: number;
  isHost: boolean;
}

export interface NowPlayingView {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
}

export interface ActiveRoundView {
  roomTrackId: string;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  guessEndsAt: string;
  guessOpensAt: string;
  guessesSubmitted: number;
  totalPlayers: number;
  canGuess: boolean;
  hasSubmitted: boolean;
  submittedGuessUserId: string | null;
  progressMs?: number;
  durationMs?: number;
}

export interface PointsAwardedView {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
}

export type RevealGuessResult = "correct" | "wrong" | "adder" | "no_guess";

export interface RevealView {
  roomTrackId: string;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  addedBy: PublicUser;
  yourResult: RevealGuessResult;
  yourPoints: number;
  correctGuessers: PublicUser[];
  pointsAwarded: PointsAwardedView[];
  scores: RoomMemberView[];
}

export interface QueuedTrackView {
  id: string;
  trackName: string;
  artistName: string;
  albumArtUrl: string | null;
  status: "queued" | "playing";
  isPlayingNow: boolean;
}

export interface RoomStateView {
  code: string;
  status: RoomStatus;
  hostUserId: string;
  hostDeviceId: string | null;
  members: RoomMemberView[];
  nowPlaying: NowPlayingView | null;
  queuedTracks: QueuedTrackView[];
  activeRound: ActiveRoundView | null;
  reveal: RevealView | null;
  tracksQueued: number;
  isCurrentUserHost: boolean;
  currentUserId: string | null;
  spotifySyncDegraded?: boolean;
}

export interface SpotifyTrackResult {
  id: string;
  uri: string;
  name: string;
  artistName: string;
  albumArtUrl: string | null;
}
