"use client";

import { useRef, useState } from "react";
import { uploadBook } from "@/actions/books";

export function UploadForm() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(formData: FormData) {
    setUploading(true);
    setError(null);
    try {
      await uploadBook(formData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setUploading(false);
    }
  }

  return (
    <form action={handleSubmit}>
      <div
        className={`relative rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          dragOver
            ? "border-amber-500 bg-amber-500/5"
            : "border-zinc-700 hover:border-zinc-500"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file && inputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            inputRef.current.files = dt.files;
            inputRef.current.form?.requestSubmit();
          }
        }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
          <svg
            className="h-6 w-6 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
            />
          </svg>
        </div>
        <p className="mb-2 text-sm text-zinc-300">
          <button
            type="button"
            className="font-medium text-amber-500 hover:text-amber-400"
            onClick={() => inputRef.current?.click()}
          >
            Choose an ePub file
          </button>{" "}
          or drag and drop
        </p>
        <p className="text-xs text-zinc-500">ePub files up to 20MB</p>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".epub"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              e.target.form?.requestSubmit();
            }
          }}
        />
      </div>

      {uploading && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-500" />
          Uploading and parsing...
        </div>
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-red-400">{error}</p>
      )}
    </form>
  );
}
