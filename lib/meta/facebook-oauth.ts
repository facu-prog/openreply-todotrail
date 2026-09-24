import { getMetaGraphApiVersion, requireEnv } from "@/lib/env";
import { encryptToken, decryptToken, signJson, verifySignedJson } from "@/lib/meta/oauth";

const PENDING_PAGES_MAX_AGE_MS = 10 * 60 * 1000;

function facebookOAuthDialogUrl() {
  return `https://www.facebook.com/${getMetaGraphApiVersion()}/dialog/oauth`;
}

function facebookGraphBase() {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`;
}

// Standard Access covers Pages that have a role on this app (the same
// account that owns the app, or a tester) — exactly like the Instagram
// connection today. Advanced Access (someone else's Page) needs App Review
// and Business Verification; see docs/setup.md.
export const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_read_engagement",
  "pages_manage_metadata",
].join(",");

export function getFacebookAuthorizationUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("FACEBOOK_APP_ID"),
    redirect_uri: redirectUri,
    scope: FACEBOOK_OAUTH_SCOPES,
    response_type: "code",
    state,
  });
  return `${facebookOAuthDialogUrl()}?${params.toString()}`;
}

interface FacebookTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

async function handleFacebookResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || data.error) {
    const message = data.error?.message ?? "Unknown Facebook API error";
    throw new Error(`${message} [code=${data.error?.code ?? response.status}]`);
  }
  return data as T;
}

export async function exchangeFacebookCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string }> {
  const url = new URL(`${facebookGraphBase()}/oauth/access_token`);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url.toString());
  const data = await handleFacebookResponse<FacebookTokenResponse>(response);
  return { accessToken: data.access_token };
}

/**
 * Exchanges a short-lived User token for a long-lived one (~60 days). A Page
 * Access Token minted from a long-lived User token effectively never expires
 * as long as that User token stays valid, which is what makes the Page
 * connection durable without a refresh flow.
 */
export async function getFacebookLongLivedUserToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${facebookGraphBase()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url.toString());
  const data = await handleFacebookResponse<FacebookTokenResponse>(response);
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 5_184_000 };
}

export interface FacebookPageOption {
  id: string;
  name: string;
  accessToken: string;
}

/** Pages the just-authenticated user manages, each with its own Page Access Token. */
export async function getFacebookManagedPages(userAccessToken: string): Promise<FacebookPageOption[]> {
  const url = new URL(`${facebookGraphBase()}/me/accounts`);
  url.searchParams.set("access_token", userAccessToken);
  url.searchParams.set("fields", "id,name,access_token");

  const response = await fetch(url.toString());
  const data = await handleFacebookResponse<{ data: { id: string; name: string; access_token: string }[] }>(
    response
  );
  return data.data.map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token }));
}

export async function subscribeFacebookPageToWebhooks(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean }> {
  const response = await fetch(
    `${facebookGraphBase()}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed_fields: ["messages", "messaging_postbacks", "feed"] }),
    }
  );
  return handleFacebookResponse(response);
}

// --- Page picker: when a user manages more than one Page, they choose which
// one to connect. The candidate list (each Page token pre-encrypted with the
// same helper InstagramAccount tokens use) travels in a short-lived, signed
// token instead of a server-side session, so no interim DB row is needed for
// a choice that might never be completed. ---

interface PendingFacebookPagesPayload {
  workspaceId: string;
  pages: { id: string; name: string; encryptedAccessToken: string }[];
  ts: number;
}

export function createPendingFacebookPagesToken(
  workspaceId: string,
  pages: FacebookPageOption[]
): string {
  const payload: PendingFacebookPagesPayload = {
    workspaceId,
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      encryptedAccessToken: encryptToken(p.accessToken),
    })),
    ts: Date.now(),
  };
  return signJson(payload);
}

export function readPendingFacebookPages(
  token: string | null | undefined
): { workspaceId: string; pages: { id: string; name: string }[] } | null {
  const parsed = verifySignedJson<PendingFacebookPagesPayload>(token);
  if (!parsed?.workspaceId || Date.now() - parsed.ts > PENDING_PAGES_MAX_AGE_MS) {
    return null;
  }
  return { workspaceId: parsed.workspaceId, pages: parsed.pages.map(({ id, name }) => ({ id, name })) };
}

/** Resolves the chosen page's decrypted access token from the pending-pages token. */
export function resolvePendingFacebookPage(
  token: string | null | undefined,
  pageId: string
): { workspaceId: string; id: string; name: string; accessToken: string } | null {
  const parsed = verifySignedJson<PendingFacebookPagesPayload>(token);
  if (!parsed?.workspaceId || Date.now() - parsed.ts > PENDING_PAGES_MAX_AGE_MS) {
    return null;
  }
  const page = parsed.pages.find((p) => p.id === pageId);
  if (!page) return null;
  return {
    workspaceId: parsed.workspaceId,
    id: page.id,
    name: page.name,
    accessToken: decryptToken(page.encryptedAccessToken),
  };
}
