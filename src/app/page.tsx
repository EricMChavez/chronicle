import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-xl text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-zinc-100">
          Chronicle
        </h1>
        <p className="mb-2 text-xl text-zinc-400">
          A progress-locked reading companion
        </p>
        <p className="mb-8 text-sm text-zinc-500">
          Upload an ePub, process it with AI, and explore a spoiler-safe codex
          that grows as you read. Like a field journal in an RPG &mdash; you
          don&apos;t see the dragon entry until you&apos;ve met the dragon.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/sign-in"
            className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
