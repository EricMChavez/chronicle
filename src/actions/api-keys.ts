"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto/encryption";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function saveApiKey(
  provider: "anthropic" | "openai",
  key: string,
  label?: string
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const encrypted = encrypt(key);

  // Upsert: delete existing key for this provider, then insert
  await db
    .delete(apiKeys)
    .where(
      and(eq(apiKeys.userId, session.user.id), eq(apiKeys.provider, provider))
    );

  await db.insert(apiKeys).values({
    userId: session.user.id,
    provider,
    encryptedKey: encrypted.encryptedKey,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    label: label || `${provider} key`,
  });

  revalidatePath("/settings");
}

export async function deleteApiKey(provider: "anthropic" | "openai") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .delete(apiKeys)
    .where(
      and(eq(apiKeys.userId, session.user.id), eq(apiKeys.provider, provider))
    );

  revalidatePath("/settings");
}

export async function getUserApiKeys() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.userId, session.user.id),
  });

  return keys.map((k) => ({
    id: k.id,
    provider: k.provider,
    label: k.label,
    createdAt: k.createdAt,
  }));
}
