"use client";

import { useTransition } from "react";
import { deleteApiKey } from "@/actions/api-keys";

interface ApiKey {
  id: string;
  provider: string;
  label: string | null;
  createdAt: Date;
}

interface ApiKeyListProps {
  keys: ApiKey[];
}

export function ApiKeyList({ keys }: ApiKeyListProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(provider: "anthropic" | "openai") {
    startTransition(async () => {
      await deleteApiKey(provider);
    });
  }

  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div
          key={key.id}
          className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
        >
          <div>
            <p className="text-sm font-medium text-zinc-200">
              {key.provider === "anthropic" ? "Anthropic" : "OpenAI"}
            </p>
            <p className="text-xs text-zinc-500">
              {key.label} &middot; Added{" "}
              {key.createdAt.toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() =>
              handleDelete(key.provider as "anthropic" | "openai")
            }
            disabled={isPending}
            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
