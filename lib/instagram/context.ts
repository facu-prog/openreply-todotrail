import { decryptToken } from "@/lib/meta/oauth";

export type InstagramContext = { provider: "META"; accessToken: string };

// `provider` still allows the legacy "ZERNIO" value so accounts fetched
// directly from Prisma type-check here without a schema change. It is never
// read: every connection is now handled through the direct Meta app.
export type ProviderAccount = {
  provider: "META" | "ZERNIO";
  workspaceId: string;
  instagramId: string;
  accessToken: string;
};

export function hasInstagramCredentials(
  account: Pick<ProviderAccount, "accessToken">
) {
  return Boolean(account.accessToken);
}

export async function createInstagramContext(
  account: ProviderAccount
): Promise<InstagramContext> {
  return { provider: "META", accessToken: decryptToken(account.accessToken) };
}
