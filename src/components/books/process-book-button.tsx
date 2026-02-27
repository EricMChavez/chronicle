"use client";

import { useState, useTransition } from "react";

interface ProcessBookButtonProps {
  bookId: string;
  label?: string;
}

export function ProcessBookButton({
  bookId,
  label = "Start Processing",
}: ProcessBookButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");

  function handleProcess() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to start processing");
        }
      } catch {
        setError("Failed to start processing");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as "anthropic" | "openai")}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
      >
        <option value="anthropic">Claude (Anthropic)</option>
        <option value="openai">GPT-4o (OpenAI)</option>
      </select>
      <button
        onClick={handleProcess}
        disabled={isPending}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
      >
        {isPending ? "Starting..." : label}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
