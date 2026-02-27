import { getUserApiKeys } from "@/actions/api-keys";
import { ApiKeyForm } from "@/components/settings/api-key-form";
import { ApiKeyList } from "@/components/settings/api-key-list";

export default async function SettingsPage() {
  const keys = await getUserApiKeys();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-100">Settings</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Manage your AI API keys. Keys are encrypted at rest and never logged.
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="mb-4 text-lg font-medium text-zinc-200">
            API Keys
          </h2>

          {keys.length > 0 && (
            <div className="mb-6">
              <ApiKeyList keys={keys} />
            </div>
          )}

          <ApiKeyForm existingProviders={keys.map((k) => k.provider)} />
        </section>
      </div>
    </div>
  );
}
