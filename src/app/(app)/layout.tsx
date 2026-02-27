import { auth } from "@/auth";
import Link from "next/link";
import { signOut } from "@/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-zinc-950">
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-bold text-zinc-100 hover:text-amber-400 transition-colors"
            >
              Chronicle
            </Link>
            <div className="hidden items-center gap-4 sm:flex">
              <Link
                href="/dashboard"
                className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/books"
                className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Books
              </Link>
              <Link
                href="/settings"
                className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {session?.user && (
              <>
                <span className="text-sm text-zinc-500">
                  {session.user.name || session.user.email}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Sign out
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
