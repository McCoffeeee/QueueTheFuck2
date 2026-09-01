import type { RoomStateView } from "@/lib/types";

export const SOCKET_EVENTS = {
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  ROOM_ENDED: "room:ended",
  ROOM_STATE: "room:state",
  TRACK_ADDED: "track:added",
  ROUND_STARTED: "round:started",
  ROUND_REVEALED: "round:revealed",
  PLAYBACK_UPDATED: "playback:updated",
  ERROR: "error",
} as const;

export interface TrackAddedPayload {
  message: string;
  tracksQueued: number;
}

export interface PlaybackUpdatedPayload {
  nowPlaying: RoomStateView["nowPlaying"];
}

export interface RoomEndedPayload {
  reason: "host_left" | "idle";
}
