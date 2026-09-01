"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { apiMutation } from "@/lib/api-client";

interface PlaybackControlsProps {
  roomCode: string;
}

export function PlaybackControls({ roomCode }: PlaybackControlsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function control(action: "play" | "pause" | "next" | "previous") {
    setLoading(action);
    setError(null);
    try {
      await apiMutation("/api/spotify/playback", {
        method: "POST",
        body: JSON.stringify({ room: roomCode, action }),
      });
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : "Playback control failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-3">
        <Button variant="secondary" disabled={!!loading} onClick={() => void control("previous")}>
          Prev
        </Button>
        <Button variant="secondary" disabled={!!loading} onClick={() => void control("play")}>
          Play
        </Button>
        <Button variant="secondary" disabled={!!loading} onClick={() => void control("pause")}>
          Pause
        </Button>
        <Button variant="secondary" disabled={!!loading} onClick={() => void control("next")}>
          Next
        </Button>
      </div>
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
