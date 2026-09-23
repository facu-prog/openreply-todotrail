import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { pickContactFields, serializeContact } from "@/app/api/crm/contacts/route";

export const runtime = "nodejs";

async function loadContact(workspaceId: string, id: string) {
  return prisma.contact.findFirst({
    where: { id, workspaceId },
    include: {
      assignedUser: { select: { id: true, name: true, email: true } },
      tags: { include: { tag: true } },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const contact = await loadContact(workspaceId, id);
  if (!contact) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: serializeContact(contact) });
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
  const existing = await prisma.contact.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const data = pickContactFields(body);
  await prisma.contact.update({ where: { id }, data });
  const contact = await loadContact(workspaceId, id);
  return NextResponse.json({ success: true, data: serializeContact(contact!) });
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
  const existing = await prisma.contact.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
