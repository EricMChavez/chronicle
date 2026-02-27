"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TYPES = [
  { value: "", label: "All" },
  { value: "character", label: "Characters" },
  { value: "location", label: "Locations" },
  { value: "event", label: "Events" },
  { value: "faction", label: "Factions" },
  { value: "theme", label: "Themes" },
  { value: "item", label: "Items" },
];

interface EntryTypeFilterProps {
  bookId: string;
}

export function EntryTypeFilter({ bookId }: EntryTypeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type") || "";

  function handleFilter(type: string) {
    const params = new URLSearchParams(searchParams);
    if (type) {
      params.set("type", type);
    } else {
      params.delete("type");
    }
    router.push(`/books/${bookId}/entries?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TYPES.map((t) => (
        <button
          key={t.value}
          onClick={() => handleFilter(t.value)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            activeType === t.value
              ? "border-amber-600 bg-amber-900/50 text-amber-300"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
