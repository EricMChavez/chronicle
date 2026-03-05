"use client";

import { useState } from "react";
import { useProcessingStatus } from "@/hooks/use-processing-status";

interface ProcessingStatusProps {
  bookId: string;
  initialStatus: string;
  onComplete?: () => void;
}

export function ProcessingStatus({
  bookId,
  initialStatus,
  onComplete,
}: ProcessingStatusProps) {
  const shouldPoll =
    initialStatus === "processing" || initialStatus === "pending";
  const { status, progress, totalChapters, error } = useProcessingStatus(
    bookId,
    shouldPoll
  );
  const [cancelling, setCancelling] = useState(false);

  const displayStatus = shouldPoll ? status : initialStatus;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch(`/api/books/${bookId}/cancel`, { method: "POST" });
    } catch {
      setCancelling(false);
    }
  };

  if (displayStatus === "completed") {
    onComplete?.();
    return (
      <div className="rounded-lg border border-green-800 bg-green-950/50 p-4">
        <p className="text-sm font-medium text-green-400">
          Processing complete
        </p>
        <p className="mt-1 text-xs text-green-500">
          All {totalChapters} chapters processed. Entries are ready to explore.
        </p>
        {error && (
          <p className="mt-2 text-xs text-amber-400">{error}</p>
        )}
      </div>
    );
  }

  if (displayStatus === "failed") {
    const wasCancelled = error === "Cancelled by user";
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/50 p-4">
        <p className="text-sm font-medium text-red-400">
          {wasCancelled ? "Processing cancelled" : "Processing failed"}
        </p>
        {error && !wasCancelled && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
        <p className="mt-2 text-xs text-zinc-400">
          You can retry processing at any time.
        </p>
      </div>
    );
  }

  if (displayStatus === "processing") {
    const percentage =
      totalChapters > 0 ? Math.round((progress / totalChapters) * 100) : 0;

    return (
      <div className="rounded-lg border border-amber-800 bg-amber-950/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-amber-400">Processing...</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-amber-500">{percentage}%</span>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded px-2 py-0.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-950 hover:text-red-300 disabled:opacity-50"
            >
              {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Processing chapter {progress} of {totalChapters}...
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-sm text-zinc-400">
        This book hasn&apos;t been processed yet. Add an API key in Settings,
        then start processing.
      </p>
    </div>
  );
}
