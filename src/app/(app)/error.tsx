"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h2 className="mb-2 text-xl font-bold text-zinc-100">
        Something went wrong
      </h2>
      <p className="mb-6 text-sm text-zinc-400">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
