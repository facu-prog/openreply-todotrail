import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { resolvePendingFacebookPage } from "@/lib/meta/facebook-oauth";
import { PENDING_PAGES_COOKIE, connectFacebookPage } from "@/app/api/facebook/callback/route";

export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const pageId = typeof body?.pageId === "string" ? body.pageId : "";
  if (!pageId) {
    return NextResponse.json({ success: false, error: "pageId is required" }, { status: 400 });
  }

  const cookieValue = request.cookies.get(PENDING_PAGES_COOKIE)?.value;
  const page = resolvePendingFacebookPage(cookieValue, pageId);
  if (!page || page.workspaceId !== workspaceId) {
    return NextResponse.json(
      { success: false, error: "This selection expired. Reconnect Facebook and try again." },
      { status: 400 }
    );
  }

  await connectFacebookPage(workspaceId, page);

  const response = NextResponse.json({ success: true });
  response.cookies.delete(PENDING_PAGES_COOKIE);
  return response;
}
