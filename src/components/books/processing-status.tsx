"use client";

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

  const displayStatus = shouldPoll ? status : initialStatus;

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
      </div>
    );
  }

  if (displayStatus === "failed") {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/50 p-4">
        <p className="text-sm font-medium text-red-400">Processing failed</p>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        <p className="mt-2 text-xs text-zinc-400">
          You can retry from the last successful chapter.
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
          <span className="text-xs text-amber-500">{percentage}%</span>
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
