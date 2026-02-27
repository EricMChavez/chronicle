"use client";

import { updateReadingProgress } from "@/actions/progress";
import { useTransition } from "react";

interface Chapter {
  chapterNumber: number;
  title: string | null;
}

interface ChapterSelectorProps {
  bookId: string;
  chapters: Chapter[];
  currentChapter: number;
}

export function ChapterSelector({
  bookId,
  chapters,
  currentChapter,
}: ChapterSelectorProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const chapter = parseInt(e.target.value, 10);
    startTransition(async () => {
      await updateReadingProgress(bookId, chapter);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor="chapter-select"
        className="text-sm font-medium text-zinc-400"
      >
        Reading progress:
      </label>
      <select
        id="chapter-select"
        value={currentChapter}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 disabled:opacity-50"
      >
        {chapters.map((ch) => (
          <option key={ch.chapterNumber} value={ch.chapterNumber}>
            Ch. {ch.chapterNumber}
            {ch.title ? `: ${ch.title}` : ""}
          </option>
        ))}
      </select>
      {isPending && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-500" />
      )}
    </div>
  );
}
