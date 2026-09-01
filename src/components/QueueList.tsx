import Image from "next/image";
import type { QueuedTrackView } from "@/lib/types";

interface QueueListProps {
  tracks: QueuedTrackView[];
}

const ROW_HEIGHT_REM = 3.5;
const VISIBLE_ROWS = 3;

function QueueTrackRow({ track, index }: { track: QueuedTrackView; index: number }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 rounded-xl border border-white/5 bg-card px-3">
      <span className="w-5 text-xs text-muted">{index + 1}</span>
      {track.albumArtUrl ? (
        <Image
          src={track.albumArtUrl}
          alt={track.trackName}
          width={40}
          height={40}
          className="rounded object-cover"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-card-hover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{track.trackName}</p>
        <p className="truncate text-xs text-muted">{track.artistName}</p>
      </div>
      <span className="shrink-0 text-xs text-muted">Up next</span>
    </div>
  );
}

export function QueueList({ tracks }: QueueListProps) {
  const upcoming = tracks.filter(
    (track) => track.status === "queued" && !track.isPlayingNow,
  );

  if (upcoming.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-card p-4 text-center text-sm text-muted">
        No songs in the queue yet.
      </div>
    );
  }

  const moreCount = Math.max(0, upcoming.length - VISIBLE_ROWS);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted">
        Game queue ({upcoming.length})
        {moreCount > 0 && (
          <span className="font-normal text-muted/80"> · scroll for {moreCount} more</span>
        )}
      </p>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
        <div
          className="space-y-2 overflow-y-auto p-2"
          style={{ maxHeight: `${ROW_HEIGHT_REM * VISIBLE_ROWS}rem` }}
        >
          {upcoming.map((track, index) => (
            <QueueTrackRow key={track.id} track={track} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
