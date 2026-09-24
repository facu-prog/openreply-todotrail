import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { readPendingFacebookPages } from "@/lib/meta/facebook-oauth";
import { PENDING_PAGES_COOKIE } from "@/app/api/facebook/callback/route";

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const pending = readPendingFacebookPages(request.cookies.get(PENDING_PAGES_COOKIE)?.value);
  if (!pending || pending.workspaceId !== workspaceId) {
    return NextResponse.json({ success: true, data: { pages: [] } });
  }

  return NextResponse.json({ success: true, data: { pages: pending.pages } });
}
