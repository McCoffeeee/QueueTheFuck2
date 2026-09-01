"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { NowPlayingView } from "@/lib/types";

interface NowPlayingCardProps {
  nowPlaying: NowPlayingView | null;
}

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function NowPlayingCard({ nowPlaying }: NowPlayingCardProps) {
  const [displayProgressMs, setDisplayProgressMs] = useState(0);
  const anchorRef = useRef({ progressMs: 0, receivedAt: 0, isPlaying: false });

  useEffect(() => {
    if (!nowPlaying) {
      setDisplayProgressMs(0);
      return;
    }

    anchorRef.current = {
      progressMs: nowPlaying.progressMs,
      receivedAt: Date.now(),
      isPlaying: nowPlaying.isPlaying,
    };
    setDisplayProgressMs(nowPlaying.progressMs);

    if (!nowPlaying.isPlaying) {
      return;
    }

    const interval = setInterval(() => {
      const { progressMs, receivedAt } = anchorRef.current;
      const elapsed = Date.now() - receivedAt;
      const durationMs = nowPlaying.durationMs;
      const next = Math.min(progressMs + elapsed, durationMs > 0 ? durationMs : progressMs + elapsed);
      setDisplayProgressMs(next);
    }, 250);

    return () => clearInterval(interval);
  }, [
    nowPlaying?.spotifyTrackId,
    nowPlaying?.progressMs,
    nowPlaying?.isPlaying,
    nowPlaying?.durationMs,
    nowPlaying,
  ]);

  if (!nowPlaying) {
    return (
      <div className="rounded-2xl border border-white/10 bg-card p-6 text-center text-muted">
        Nothing is playing yet. Add songs to the queue to get started.
      </div>
    );
  }

  const progress =
    nowPlaying.durationMs > 0 ? (displayProgressMs / nowPlaying.durationMs) * 100 : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-card p-6">
      <div className="flex gap-4">
        {nowPlaying.albumArtUrl ? (
          <Image
            src={nowPlaying.albumArtUrl}
            alt={nowPlaying.trackName}
            width={96}
            height={96}
            className="rounded-lg object-cover"
          />
        ) : (
          <div className="h-24 w-24 rounded-lg bg-card-hover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-spotify">
            {nowPlaying.isPlaying ? "Now Playing" : "Paused"}
          </p>
          <h3 className="mt-1 truncate text-xl font-bold">{nowPlaying.trackName}</h3>
          <p className="truncate text-muted">{nowPlaying.artistName}</p>
          {nowPlaying.durationMs > 0 && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-spotify transition-[width] duration-200 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{formatMs(displayProgressMs)}</span>
                <span>{formatMs(nowPlaying.durationMs)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
