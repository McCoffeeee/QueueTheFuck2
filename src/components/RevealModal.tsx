"use client";

import { Avatar } from "@/components/Avatar";
import type { RevealView } from "@/lib/types";

interface RevealModalProps {
  reveal: RevealView;
}

function resultHeadline(yourResult: RevealView["yourResult"]) {
  switch (yourResult) {
    case "correct":
      return { title: "You guessed right!", className: "text-spotify" };
    case "wrong":
      return { title: "Wrong guess", className: "text-red-400" };
    case "adder":
      return { title: "Your song!", className: "text-spotify" };
    default:
      return { title: "Round over", className: "text-muted" };
  }
}

function resultDetail(reveal: RevealView) {
  switch (reveal.yourResult) {
    case "correct":
      return reveal.yourPoints > 0
        ? `+${reveal.yourPoints} points added to your score.`
        : "Nice ear!";
    case "wrong":
      return "Better luck on the next one.";
    case "adder":
      return "Let's see who caught on.";
    default:
      return reveal.correctGuessers.length > 0
        ? `${reveal.correctGuessers.map((user) => user.displayName).join(", ")} guessed correctly.`
        : "Nobody guessed correctly.";
  }
}

export function RevealModal({ reveal }: RevealModalProps) {
  const headline = resultHeadline(reveal.yourResult);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-3xl border border-spotify/40 bg-card p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reveal-title"
      >
        <p className={`text-center text-2xl font-bold ${headline.className}`}>{headline.title}</p>
        <p className="mt-2 text-center text-sm text-muted">{resultDetail(reveal)}</p>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Avatar name={reveal.addedBy.displayName} src={reveal.addedBy.avatarUrl} size={96} />
          <h2 id="reveal-title" className="text-center text-xl font-semibold">
            {reveal.addedBy.displayName}
          </h2>
          <p className="text-center text-sm text-muted">added this song</p>
        </div>

        {reveal.albumArtUrl && (
          <img
            src={reveal.albumArtUrl}
            alt=""
            className="mx-auto mt-5 h-24 w-24 rounded-xl object-cover shadow-lg"
          />
        )}

        <p className="mt-3 text-center text-sm text-muted">
          {reveal.trackName} · {reveal.artistName}
        </p>
      </div>
    </div>
  );
}
