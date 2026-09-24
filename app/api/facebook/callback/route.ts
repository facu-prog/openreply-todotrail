import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { encryptToken, verifyOAuthState } from "@/lib/meta/oauth";
import {
  createPendingFacebookPagesToken,
  exchangeFacebookCodeForToken,
  getFacebookLongLivedUserToken,
  getFacebookManagedPages,
  subscribeFacebookPageToWebhooks,
} from "@/lib/meta/facebook-oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

export const PENDING_PAGES_COOKIE = "fb_pending_pages";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: state.workspaceId, userId: session.user.id },
  });
  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=forbidden`);
  }

  try {
    const redirectUri = `${baseUrl}/api/facebook/callback`;
    const { accessToken: shortLivedToken } = await exchangeFacebookCodeForToken(code, redirectUri);
    const { accessToken: longLivedUserToken } = await getFacebookLongLivedUserToken(shortLivedToken);
    const pages = await getFacebookManagedPages(longLivedUserToken);

    if (pages.length === 0) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=no_pages`);
    }

    if (pages.length > 1) {
      // Let the user pick which Page — see the picker cookie note in
      // lib/meta/facebook-oauth.ts.
      const token = createPendingFacebookPagesToken(state.workspaceId, pages);
      const response = NextResponse.redirect(`${baseUrl}/settings?facebook=choose`);
      response.cookies.set(PENDING_PAGES_COOKIE, token, {
        path: "/",
        maxAge: 10 * 60,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }

    await connectFacebookPage(state.workspaceId, pages[0]);
    return NextResponse.redirect(`${baseUrl}/settings?facebook=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Facebook Callback] Error:", err);
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Facebook Page connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/settings?facebook=failed&reason=${encodeURIComponent(message.slice(0, 200))}`
    );
  }
}

export async function connectFacebookPage(
  workspaceId: string,
  page: { id: string; name: string; accessToken: string }
): Promise<void> {
  const encryptedToken = encryptToken(page.accessToken);

  let webhookSubscribed = false;
  try {
    const subscription = await subscribeFacebookPageToWebhooks(page.id, page.accessToken);
    webhookSubscribed = Boolean(subscription.success);
  } catch (subscriptionError) {
    console.warn("[Facebook Callback] Webhook subscription failed:", subscriptionError);
  }

  const data = { name: page.name, accessToken: encryptedToken, webhookSubscribed };
  const existing = await prisma.facebookPage.findUnique({ where: { pageId: page.id } });
  if (existing) {
    await prisma.facebookPage.updateMany({
      where: { id: existing.id, workspaceId },
      data,
    });
  } else {
    await prisma.facebookPage.create({ data: { ...data, workspaceId, pageId: page.id } });
  }
}
