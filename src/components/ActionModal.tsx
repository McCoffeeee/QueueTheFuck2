"use client";

import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/Button";

interface ActionModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function ActionModal({ title, onClose, children }: ActionModalProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl border border-white/10 bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-modal-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="action-modal-title" className="text-lg font-bold">
            {title}
          </h2>
          <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
