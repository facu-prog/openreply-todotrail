import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

const includeShape = {
  contact: { select: { id: true, name: true, instagramUsername: true, whatsappPhone: true } },
  assignedUser: { select: { id: true, name: true, email: true } },
  complaintType: { select: { id: true, name: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true, email: true } } },
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ticket = await prisma.ticket.findFirst({
    where: { id, workspaceId },
    include: includeShape,
  });
  if (!ticket) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: ticket });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.ticket.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  // A stage must belong to the ticket's own pipeline — this is the only way a
  // ticket moves between stages, so it's worth guarding server-side too.
  if (typeof body.stageId === "string") {
    const stage = await prisma.stage.findFirst({
      where: { id: body.stageId, pipelineId: existing.pipelineId },
    });
    if (!stage) {
      return NextResponse.json({ success: false, error: "Invalid stage for this pipeline" }, { status: 400 });
    }
  }

  await prisma.ticket.update({
    where: { id },
    data: {
      ...(typeof body.stageId === "string" ? { stageId: body.stageId } : {}),
      ...(typeof body.title === "string" ? { title: body.title.trim() || null } : {}),
      ...("assignedUserId" in body
        ? { assignedUserId: body.assignedUserId || null }
        : {}),
      ...("complaintTypeId" in body
        ? { complaintTypeId: body.complaintTypeId || null }
        : {}),
      ...("contactId" in body ? { contactId: body.contactId || null } : {}),
    },
  });

  const ticket = await prisma.ticket.findUnique({ where: { id }, include: includeShape });
  return NextResponse.json({ success: true, data: ticket });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.ticket.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  await prisma.ticket.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
