import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [workspaceId, userId] = await Promise.all([getCurrentWorkspaceId(), getCurrentUserId()]);
  if (!workspaceId || !userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ticket = await prisma.ticket.findFirst({ where: { id, workspaceId } });
  if (!ticket) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ success: false, error: "Comment body is required" }, { status: 400 });
  }

  const comment = await prisma.ticketComment.create({
    data: { ticketId: id, authorUserId: userId, body: text },
    include: { author: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ success: true, data: comment });
}
