import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import type { RoomStateView } from "@/lib/types";

interface RoomLobbyProps {
  room: RoomStateView;
  onStart: () => void;
  starting?: boolean;
  startError?: string | null;
}

export function RoomLobby({ room, onStart, starting, startError }: RoomLobbyProps) {
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${room.code}`
      : `/room/${room.code}`;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-card p-6">
        <p className="text-sm text-muted">Room code</p>
        <p className="mt-1 text-4xl font-bold tracking-[0.3em]">{room.code}</p>
        <p className="mt-3 break-all text-sm text-muted">{inviteUrl}</p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Players ({room.members.length})</h2>
        <div className="space-y-2">
          {room.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-card px-4 py-3"
            >
              <Avatar name={member.displayName} src={member.avatarUrl} />
              <div className="flex-1">
                <p className="font-medium">{member.displayName}</p>
                <p className="text-xs text-muted">
                  {member.isHost ? "Host" : member.isGuest ? "Guest" : "Player"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {room.isCurrentUserHost && (
        <div className="space-y-3">
          <Button onClick={onStart} disabled={starting || room.members.length < 2} className="w-full">
            {starting ? "Starting..." : "Start Game"}
          </Button>
          {room.members.length < 2 && (
            <p className="text-center text-sm text-muted">Invite at least one friend to start.</p>
          )}
          {startError && <p className="text-center text-sm text-red-400">{startError}</p>}
        </div>
      )}

      {!room.isCurrentUserHost && (
        <p className="text-center text-sm text-muted">Waiting for the host to start the game...</p>
      )}
    </div>
  );
}
