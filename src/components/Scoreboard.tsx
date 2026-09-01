import { Avatar } from "@/components/Avatar";
import type { RoomMemberView } from "@/lib/types";

interface ScoreboardProps {
  members: RoomMemberView[];
}

export function Scoreboard({ members }: ScoreboardProps) {
  const sorted = [...members].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-2">
      {sorted.map((member, index) => (
        <div
          key={member.id}
          className="flex items-center gap-3 rounded-xl border border-white/5 bg-card px-4 py-3"
        >
          <span className="w-6 text-sm font-bold text-muted">#{index + 1}</span>
          <Avatar name={member.displayName} src={member.avatarUrl} />
          <div className="flex-1">
            <p className="font-medium">{member.displayName}</p>
            {member.isHost && <p className="text-xs text-spotify">Host</p>}
          </div>
          <span className="text-lg font-bold text-spotify">{member.score}</span>
        </div>
      ))}
    </div>
  );
}
