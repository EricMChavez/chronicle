"use client";

import { useState, useTransition } from "react";
import { saveApiKey } from "@/actions/api-keys";

interface ApiKeyFormProps {
  existingProviders: string[];
}

export function ApiKeyForm({ existingProviders }: ApiKeyFormProps) {
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [key, setKey] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;

    setMessage(null);
    startTransition(async () => {
      try {
        await saveApiKey(provider, key.trim());
        setKey("");
        setMessage({ type: "success", text: "API key saved successfully" });
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to save key",
        });
      }
    });
  }

  const willOverwrite = existingProviders.includes(provider);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Provider
        </label>
        <select
          value={provider}
          onChange={(e) =>
            setProvider(e.target.value as "anthropic" | "openai")
          }
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT-4o)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          API Key
        </label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-..."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
      </div>

      {willOverwrite && (
        <p className="text-xs text-amber-500">
          This will replace your existing {provider} key.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !key.trim()}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save API Key"}
      </button>

      {message && (
        <p
          className={`text-sm ${
            message.type === "success" ? "text-green-400" : "text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
