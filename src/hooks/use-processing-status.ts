"use client";

import { useEffect, useState, useCallback } from "react";

interface ProcessingStatus {
  status: "pending" | "processing" | "completed" | "partial" | "failed";
  progress: number;
  totalChapters: number;
  compiledChapters: number;
  error: string | null;
}

export function useProcessingStatus(bookId: string, enabled: boolean = true) {
  const [data, setData] = useState<ProcessingStatus>({
    status: "pending",
    progress: 0,
    totalChapters: 0,
    compiledChapters: 0,
    error: null,
  });

  const connect = useCallback(() => {
    if (!enabled) return;

    const eventSource = new EventSource(`/api/books/${bookId}/status`);

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);

        if (parsed.status === "completed" || parsed.status === "partial" || parsed.status === "failed") {
          eventSource.close();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [bookId, enabled]);

  useEffect(() => {
    return connect();
  }, [connect]);

  return data;
}
