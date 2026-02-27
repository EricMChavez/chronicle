"use client";

import { useState } from "react";

interface SourcePopoverProps {
  observation: string;
  excerpt: string;
  searchHint: string;
  chapter: number;
}

export function SourcePopover({
  observation,
  excerpt,
  searchHint,
  chapter,
}: SourcePopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="text-left text-sm text-zinc-300 underline decoration-zinc-600 decoration-dotted underline-offset-2 transition-colors hover:text-amber-400 hover:decoration-amber-600"
      >
        {observation}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-zinc-700 bg-zinc-800 p-4 shadow-xl">
            <div className="mb-3">
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                From the book
              </h4>
              <p className="text-sm italic text-zinc-300">
                &ldquo;{excerpt}&rdquo;
              </p>
            </div>
            <div className="border-t border-zinc-700 pt-3">
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Find in book
              </h4>
              <p className="text-xs text-zinc-400">
                Ch. {chapter} &mdash; search for &ldquo;
                <span className="text-amber-400">{searchHint}</span>&rdquo;
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
