"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { apiMutation } from "@/lib/api-client";
import type { ActiveRoundView, NowPlayingView, RoomMemberView } from "@/lib/types";

interface GuessPanelProps {
  roomCode: string;
  members: RoomMemberView[];
  activeRound: ActiveRoundView | null;
  nowPlaying: NowPlayingView | null;
  queueCount: number;
  currentUserId: string | null;
  onGuessSubmitted?: () => void;
}

export function GuessPanel({
  roomCode,
  members,
  activeRound,
  nowPlaying,
  queueCount,
  currentUserId,
  onGuessSubmitted,
}: GuessPanelProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [opensInSeconds, setOpensInSeconds] = useState(0);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRound) {
      setSecondsLeft(0);
      setOpensInSeconds(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(activeRound.guessEndsAt).getTime() - Date.now()) / 1000),
      );
      const untilOpen = Math.max(
        0,
        Math.ceil((new Date(activeRound.guessOpensAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      setOpensInSeconds(untilOpen);
    };

    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [activeRound]);

  async function submitGuess(guessedUserId: string) {
    if (!activeRound || !activeRound.canGuess) return;
    setSubmitting(guessedUserId);
    setError(null);
    try {
      await apiMutation(`/api/rooms/${roomCode}/guess`, {
        method: "POST",
        body: JSON.stringify({
          roomTrackId: activeRound.roomTrackId,
          guessedUserId,
        }),
      });
      onGuessSubmitted?.();
    } catch (guessError) {
      setError(guessError instanceof Error ? guessError.message : "Failed to submit guess");
    } finally {
      setSubmitting(null);
    }
  }

  if (!activeRound) {
    return (
      <p className="text-center text-muted">
        {queueCount > 0
          ? "Waiting for the next game song to start playing. Songs in the queue will open a guess round when they play."
          : nowPlaying
            ? "Nothing from the game queue is playing yet. Add a song with Add Song to start."
            : "No song is playing yet. Add a song to get started."}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-medium">Who added this song?</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-spotify">{secondsLeft}s</p>
        <p className="mt-1 text-xs text-muted">
          {activeRound.guessesSubmitted}/{activeRound.totalPlayers} guesses in
        </p>
      </div>

      {!activeRound.canGuess && opensInSeconds > 0 && !activeRound.hasSubmitted ? (
        <p className="text-center text-sm text-muted">
          Listen up! Guessing opens in {opensInSeconds}s...
        </p>
      ) : !activeRound.canGuess && activeRound.hasSubmitted ? (
        <p className="text-center text-sm text-spotify">
          Guess submitted
          {activeRound.submittedGuessUserId
            ? ` — you picked ${members.find((m) => m.id === activeRound.submittedGuessUserId)?.displayName ?? "someone"}`
            : ""}
          . Waiting for the song to end...
        </p>
      ) : !activeRound.canGuess ? (
        <p className="text-center text-sm text-muted">
          You added this song — sit back and see who guesses you!
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {members
            .filter((member) => member.id !== currentUserId)
            .map((member) => (
            <Button
              key={member.id}
              variant="secondary"
              className="h-auto flex-col gap-2 py-4"
              disabled={!!submitting}
              onClick={() => void submitGuess(member.id)}
            >
              <Avatar name={member.displayName} src={member.avatarUrl} size={48} />
              <span>{member.displayName}</span>
            </Button>
          ))}
        </div>
      )}

      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
