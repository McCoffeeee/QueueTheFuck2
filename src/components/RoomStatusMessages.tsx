interface RoomStatusMessagesProps {
  spotifySyncDegraded?: boolean;
  connected: boolean;
  syncStale: boolean;
  isPlaying: boolean;
  socketError: string | null;
}

export function RoomStatusMessages({
  spotifySyncDegraded,
  connected,
  syncStale,
  isPlaying,
  socketError,
}: RoomStatusMessagesProps) {
  const showReconnecting = connected && syncStale && isPlaying && !socketError;
  const showConnecting = !connected && !socketError;

  if (!spotifySyncDegraded && !showConnecting && !showReconnecting && !socketError) {
    return null;
  }

  return (
    <div className="space-y-2">
      {spotifySyncDegraded && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          Playback sync delayed — game queue and guessing still work.
        </p>
      )}
      {showConnecting && (
        <p className="text-center text-xs text-muted">Connecting live sync...</p>
      )}
      {showReconnecting && (
        <p className="text-center text-xs text-muted">Reconnecting live sync...</p>
      )}
      {socketError && <p className="text-center text-sm text-red-400">{socketError}</p>}
    </div>
  );
}
