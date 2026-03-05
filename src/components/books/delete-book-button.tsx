"use client";

import { useState, useTransition } from "react";
import { deleteBook } from "@/actions/books";

interface DeleteBookButtonProps {
  bookId: string;
  processingStatus: string;
}

export function DeleteBookButton({
  bookId,
  processingStatus,
}: DeleteBookButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteBook(bookId);
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-red-400 hover:text-red-300 transition-colors"
      >
        Delete Book
      </button>
    );
  }

  const warning =
    processingStatus === "processing"
      ? "This book is currently being processed. Deleting will abort processing and remove all data."
      : processingStatus === "completed"
        ? "This book has been processed. Deleting will remove all generated entries and data."
        : "This will permanently delete this book and all its data.";

  return (
    <div className="rounded-lg border border-red-900 bg-red-950/30 p-4">
      <p className="text-sm text-red-300">{warning}</p>
      <div className="mt-3 flex gap-3">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50"
        >
          {isPending ? "Deleting..." : "Confirm Delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
