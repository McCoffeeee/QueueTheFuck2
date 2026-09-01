"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { apiJson } from "@/lib/api-client";

interface GuestJoinFormProps {
  roomCode?: string;
  onJoined?: () => void;
  title?: string;
  description?: string;
}

export function GuestJoinForm({
  roomCode,
  onJoined,
  title = "Join the party",
  description = "Enter a name to join. No Spotify account needed.",
}: GuestJoinFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiJson("/api/auth/guest", {
        method: "POST",
        body: JSON.stringify({ displayName: name }),
      });

      if (roomCode) {
        await apiJson(`/api/rooms/${roomCode}/join`, { method: "POST" });
      }

      onJoined?.();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Failed to join");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-card p-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>

      <input
        type="text"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Your name"
        maxLength={24}
        className="w-full rounded-full border border-white/10 bg-background px-4 py-3 text-sm outline-none focus:border-spotify"
      />

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <Button className="w-full" disabled={loading || displayName.trim().length < 2} onClick={() => void handleJoin()}>
        {loading ? "Joining..." : "Join as guest"}
      </Button>
    </div>
  );
}
