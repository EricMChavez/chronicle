import { UploadForm } from "@/components/books/upload-form";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-zinc-100">Upload a Book</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Upload an ePub file to create a new codex. The book will be parsed into
        chapters and stored for AI processing.
      </p>
      <UploadForm />
    </div>
  );
}
