"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface EntryCategoryFilterProps {
  bookId: string;
  categories: string[];
}

export function EntryCategoryFilter({ bookId, categories }: EntryCategoryFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category") || "";

  function handleFilter(category: string) {
    const params = new URLSearchParams(searchParams);
    if (category) {
      params.set("category", category);
    } else {
      params.delete("category");
    }
    router.push(`/books/${bookId}/entries?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => handleFilter("")}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          activeCategory === ""
            ? "border-amber-600 bg-amber-900/50 text-amber-300"
            : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => handleFilter(cat)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            activeCategory === cat
              ? "border-amber-600 bg-amber-900/50 text-amber-300"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
