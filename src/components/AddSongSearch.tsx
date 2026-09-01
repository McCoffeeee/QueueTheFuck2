"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/Button";
import { apiJson } from "@/lib/api-client";
import type { RoomStateView, SpotifyTrackResult } from "@/lib/types";

interface AddSongSearchProps {
  roomCode: string;
  disabled?: boolean;
  onRoomUpdate?: (room: RoomStateView) => void;
}

export function AddSongSearch({ roomCode, disabled, onRoomUpdate }: AddSongSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiJson<{ tracks?: SpotifyTrackResult[] }>(
          `/api/spotify/search?q=${encodeURIComponent(query)}`,
        );
        setResults(data.tracks || []);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [query]);

  async function addTrack(track: SpotifyTrackResult) {
    setAdding(track.id);
    setError(null);
    setMessage(null);
    try {
      const data = await apiJson<{
        room?: RoomStateView;
        spotifyWarning?: string | null;
      }>(`/api/rooms/${roomCode}/tracks`, {
        method: "POST",
        body: JSON.stringify({
          spotifyTrackId: track.id,
          trackUri: track.uri,
          trackName: track.name,
          artistName: track.artistName,
          albumArtUrl: track.albumArtUrl,
        }),
      });
      if (data.room) {
        onRoomUpdate?.(data.room);
      }
      setMessage(
        data.spotifyWarning
          ? "Song added to the game queue (Spotify playback issue — check host device)"
          : "Song added to the queue!",
      );
      setQuery("");
      setResults([]);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Failed to add song");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search for a song..."
        disabled={disabled}
        className="w-full rounded-full border border-white/10 bg-card px-4 py-3 text-sm outline-none focus:border-spotify"
      />

      {loading && <p className="text-sm text-muted">Searching...</p>}
      {message && <p className="text-sm text-spotify">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {results.map((track) => (
          <div
            key={track.id}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-card p-3"
          >
            {track.albumArtUrl ? (
              <Image
                src={track.albumArtUrl}
                alt={track.name}
                width={48}
                height={48}
                className="rounded object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded bg-card-hover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{track.name}</p>
              <p className="truncate text-sm text-muted">{track.artistName}</p>
            </div>
            <Button
              variant="secondary"
              disabled={disabled || adding === track.id}
              onClick={() => void addTrack(track)}
            >
              {adding === track.id ? "Adding..." : "Add"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
