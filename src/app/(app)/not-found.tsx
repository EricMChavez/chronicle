import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h2 className="mb-2 text-xl font-bold text-zinc-100">Not Found</h2>
      <p className="mb-6 text-sm text-zinc-400">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
