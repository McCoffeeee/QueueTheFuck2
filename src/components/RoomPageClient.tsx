"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionModal } from "@/components/ActionModal";
import { AddSongSearch } from "@/components/AddSongSearch";
import { DevicePicker } from "@/components/DevicePicker";
import { GuestJoinForm } from "@/components/GuestJoinForm";
import { GuessPanel } from "@/components/GuessPanel";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { PlaybackControls } from "@/components/PlaybackControls";
import { QueueList } from "@/components/QueueList";
import { RevealModal } from "@/components/RevealModal";
import { RoomLobby } from "@/components/RoomLobby";
import { RoomStatusMessages } from "@/components/RoomStatusMessages";
import { Scoreboard } from "@/components/Scoreboard";
import { Button } from "@/components/Button";
import { apiFetch, apiJson } from "@/lib/api-client";
import {
  CLIENT_FALLBACK_POLL_MS,
  LOBBY_POLL_MS,
  PLAYING_DB_POLL_MS,
  REVEAL_MODAL_DISMISS_AFTER_NEXT_SONG_MS,
  SYNC_STALE_THRESHOLD_MS,
} from "@/lib/constants";
import { useRoomSocket } from "@/lib/socket-client";
import { useRoomPolling } from "@/lib/use-room-polling";
import type { RoomEndedPayload } from "@/lib/socket-events";
import type { RevealView, RoomStateView } from "@/lib/types";

interface RoomPageClientProps {
  initialRoom: RoomStateView;
}

type OpenModal = "add-song" | "guess" | null;

export function RoomPageClient({ initialRoom }: RoomPageClientProps) {
  const [room, setRoom] = useState(initialRoom);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const [needsGuestJoin, setNeedsGuestJoin] = useState(!initialRoom.currentUserId);
  const [checkingSession, setCheckingSession] = useState(!initialRoom.currentUserId);
  const [showReveal, setShowReveal] = useState<RevealView | null>(null);
  const lastRevealIdRef = useRef<string | null>(null);
  const autoOpenedGuessRoundRef = useRef<string | null>(null);
  const revealDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncAtRef = useRef(Date.now());
  const [syncStale, setSyncStale] = useState(false);
  const [clientTick, setClientTick] = useState(0);

  const handleState = useCallback((state: RoomStateView) => {
    lastSyncAtRef.current = Date.now();
    setSyncStale(false);
    setRoom((prev) => {
      const userId = state.currentUserId ?? prev.currentUserId;
      return {
        ...state,
        currentUserId: userId,
        isCurrentUserHost: userId === state.hostUserId,
      };
    });
    if (state.currentUserId) {
      setNeedsGuestJoin(false);
    }
  }, []);

  const handleRoomEnded = useCallback(
    (_payload: RoomEndedPayload) => {
      // #region agent log
      fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
        body: JSON.stringify({
          sessionId: "cb7553",
          runId: "host-leave-pre",
          hypothesisId: "H4",
          location: "RoomPageClient.tsx:handleRoomEnded",
          message: "room ended handler navigating home",
          data: { roomCode: room.code },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      window.location.assign("/");
    },
    [room.code],
  );

  const handleReveal = useCallback((reveal: RevealView) => {
    if (reveal.roomTrackId === lastRevealIdRef.current) {
      return;
    }
    lastRevealIdRef.current = reveal.roomTrackId;
    setShowReveal(reveal);
    setOpenModal(null);
  }, []);

  const goHome = useCallback(() => {
    // #region agent log
    fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
      body: JSON.stringify({
        sessionId: "cb7553",
        runId: "host-leave-pre",
        hypothesisId: "H1,H3,H5",
        location: "RoomPageClient.tsx:goHome",
        message: "goHome clicked",
        data: { roomCode: room.code, pathname: window.location.pathname },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    void (async () => {
      let leaveOk = false;
      let leaveError: string | null = null;
      try {
        await apiJson(`/api/rooms/${room.code}/leave`, { method: "POST" });
        leaveOk = true;
      } catch (error) {
        leaveError = error instanceof Error ? error.message : "leave failed";
      }
      // #region agent log
      fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
        body: JSON.stringify({
          sessionId: "cb7553",
          runId: "host-leave-pre",
          hypothesisId: "H2",
          location: "RoomPageClient.tsx:goHome",
          message: "leave API finished",
          data: { roomCode: room.code, leaveOk, leaveError, pathname: window.location.pathname },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      // #region agent log
      fetch("http://127.0.0.1:7616/ingest/f3659801-5dfa-40b6-9a37-6069a017f75b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cb7553" },
        body: JSON.stringify({
          sessionId: "cb7553",
          runId: "host-leave-pre",
          hypothesisId: "H1",
          location: "RoomPageClient.tsx:goHome",
          message: "calling window.location.assign home",
          data: { roomCode: room.code, pathname: window.location.pathname },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      window.location.assign("/");
    })();
  }, [room.code]);

  const liveUpdatesEnabled = !needsGuestJoin && !checkingSession;

  const socketCode = !needsGuestJoin || checkingSession ? room.code : "";

  const { connected, error: socketError } = useRoomSocket(
    socketCode,
    liveUpdatesEnabled ? handleState : undefined,
    socketCode ? handleRoomEnded : undefined,
    liveUpdatesEnabled ? handleReveal : undefined,
  );

  useEffect(() => {
    if (!liveUpdatesEnabled || room.status !== "playing") {
      setSyncStale(false);
      return;
    }

    const interval = setInterval(() => {
      setSyncStale(Date.now() - lastSyncAtRef.current > SYNC_STALE_THRESHOLD_MS);
    }, 2000);

    return () => clearInterval(interval);
  }, [liveUpdatesEnabled, room.status]);

  const pollEnabled =
    liveUpdatesEnabled &&
    (!connected ||
      room.status === "lobby" ||
      (room.status === "playing" && syncStale));

  const pollIntervalMs =
    room.status === "lobby"
      ? LOBBY_POLL_MS
      : room.status === "playing" && syncStale
        ? PLAYING_DB_POLL_MS
        : CLIENT_FALLBACK_POLL_MS;

  useRoomPolling(room.code, pollEnabled, handleState, pollIntervalMs);

  useEffect(() => {
    const round = room.activeRound;
    if (
      round?.canGuess &&
      round.roomTrackId !== autoOpenedGuessRoundRef.current
    ) {
      setOpenModal("guess");
      autoOpenedGuessRoundRef.current = round.roomTrackId;
    }

    if (!round) {
      autoOpenedGuessRoundRef.current = null;
    }
  }, [room.activeRound]);

  useEffect(() => {
    if (room.reveal && room.reveal.roomTrackId !== lastRevealIdRef.current) {
      handleReveal(room.reveal);
    }

    if (!room.reveal && !room.activeRound) {
      lastRevealIdRef.current = null;
    }
  }, [room.reveal, room.activeRound, handleReveal]);

  useEffect(() => {
    if (!liveUpdatesEnabled || room.status !== "playing") {
      return;
    }

    const interval = setInterval(() => {
      setClientTick((tick) => tick + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [liveUpdatesEnabled, room.status]);

  useEffect(() => {
    if (!showReveal) {
      if (revealDismissTimerRef.current) {
        clearTimeout(revealDismissTimerRef.current);
        revealDismissTimerRef.current = null;
      }
      return;
    }

    const nowPlaying = room.nowPlaying;
    const currentTrackId = nowPlaying?.spotifyTrackId ?? null;
    const nextSongStarted =
      currentTrackId !== null && currentTrackId !== showReveal.spotifyTrackId;

    if (nextSongStarted && !revealDismissTimerRef.current) {
      revealDismissTimerRef.current = setTimeout(() => {
        setShowReveal(null);
        revealDismissTimerRef.current = null;
      }, REVEAL_MODAL_DISMISS_AFTER_NEXT_SONG_MS);
    }

    if (!nowPlaying && !revealDismissTimerRef.current) {
      revealDismissTimerRef.current = setTimeout(() => {
        setShowReveal(null);
        revealDismissTimerRef.current = null;
      }, REVEAL_MODAL_DISMISS_AFTER_NEXT_SONG_MS);
    }
  }, [showReveal, room.nowPlaying?.spotifyTrackId, room.nowPlaying, clientTick]);

  useEffect(() => {
    return () => {
      if (revealDismissTimerRef.current) {
        clearTimeout(revealDismissTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    async function checkExistingSession() {
      if (initialRoom.currentUserId) {
        setCheckingSession(false);
        return;
      }

      try {
        const meData = await apiJson<{ user?: { id: string } }>("/api/auth/me");

        if (meData.user) {
          const data = await apiJson<{ room: RoomStateView }>(
            `/api/rooms/${room.code}/join`,
            { method: "POST" },
          );
          setRoom(data.room);
          setNeedsGuestJoin(false);
          return;
        }
      } catch {
        // Show guest join form
      } finally {
        setCheckingSession(false);
      }
    }

    void checkExistingSession();
  }, [initialRoom.currentUserId, room.code]);

  async function handleGuestJoined() {
    const data = await apiJson<{ room: RoomStateView }>(`/api/rooms/${room.code}`);
    setRoom(data.room);
    setNeedsGuestJoin(false);
  }

  async function startGame() {
    setStarting(true);
    setStartError(null);
    try {
      await apiJson(`/api/rooms/${room.code}/start`, { method: "POST" });
    } catch (startErr) {
      setStartError(startErr instanceof Error ? startErr.message : "Failed to start game");
    } finally {
      setStarting(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-center text-muted">Loading room...</p>
      </main>
    );
  }

  if (needsGuestJoin) {
    return (
      <main className="mx-auto max-w-lg space-y-6 p-6">
        <div className="text-center">
          <p className="text-sm text-muted">Room</p>
          <h1 className="text-2xl font-bold tracking-[0.2em]">{room.code}</h1>
        </div>
        <GuestJoinForm roomCode={room.code} onJoined={() => void handleGuestJoined()} />
        <Button className="w-full" variant="ghost" onClick={goHome}>
          Back home
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6 pb-28">
      {showReveal && <RevealModal reveal={showReveal} />}

      {openModal === "add-song" && (
        <ActionModal title="Add a song" onClose={() => setOpenModal(null)}>
          <AddSongSearch roomCode={room.code} onRoomUpdate={handleState} />
        </ActionModal>
      )}

      {openModal === "guess" && (
        <ActionModal title="Make your guess" onClose={() => setOpenModal(null)}>
          <GuessPanel
            roomCode={room.code}
            members={room.members}
            activeRound={room.activeRound}
            nowPlaying={room.nowPlaying}
            queueCount={room.tracksQueued}
            currentUserId={room.currentUserId}
            onGuessSubmitted={() => setOpenModal(null)}
          />
        </ActionModal>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Room</p>
          <h1 className="text-2xl font-bold tracking-[0.2em]">{room.code}</h1>
        </div>
        <Button variant="ghost" onClick={goHome}>
          Home
        </Button>
      </div>

      {room.status === "lobby" ? (
        <>
          <RoomLobby room={room} onStart={() => void startGame()} starting={starting} startError={startError} />
          <RoomStatusMessages
            spotifySyncDegraded={room.spotifySyncDegraded}
            connected={connected}
            syncStale={syncStale}
            isPlaying={false}
            socketError={socketError}
          />
        </>
      ) : (
        <div className="space-y-5">
          <NowPlayingCard nowPlaying={room.nowPlaying} />

          {room.isCurrentUserHost && (
            <div className="space-y-4">
              <DevicePicker roomCode={room.code} selectedDeviceId={room.hostDeviceId} />
              <PlaybackControls roomCode={room.code} />
            </div>
          )}

          <QueueList tracks={room.queuedTracks} />

          <div>
            <p className="mb-2 text-sm font-medium text-muted">Scores</p>
            <Scoreboard members={room.members} />
          </div>

          <RoomStatusMessages
            spotifySyncDegraded={room.spotifySyncDegraded}
            connected={connected}
            syncStale={syncStale}
            isPlaying
            socketError={socketError}
          />
        </div>
      )}

      {room.status === "playing" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setOpenModal("add-song")}
            >
              Add Song
            </Button>
            <Button
              variant="primary"
              className="relative flex-1"
              onClick={() => setOpenModal("guess")}
            >
              Guess
              {room.activeRound?.canGuess && (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white" />
              )}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
