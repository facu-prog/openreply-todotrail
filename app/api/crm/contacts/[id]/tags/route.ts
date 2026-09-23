import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const contact = await prisma.contact.findFirst({ where: { id, workspaceId } });
  if (!contact) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ success: false, error: "Tag name is required" }, { status: 400 });
  }

  const tag = await prisma.tag.upsert({
    where: { workspaceId_name: { workspaceId, name } },
    create: { workspaceId, name },
    update: {},
  });

  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId: id, tagId: tag.id } },
    create: { contactId: id, tagId: tag.id },
    update: {},
  });

  return NextResponse.json({ success: true, data: tag });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const contact = await prisma.contact.findFirst({ where: { id, workspaceId } });
  if (!contact) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const tagId = request.nextUrl.searchParams.get("tagId");
  if (!tagId) {
    return NextResponse.json({ success: false, error: "tagId is required" }, { status: 400 });
  }
  await prisma.contactTag.deleteMany({ where: { contactId: id, tagId } });
  return NextResponse.json({ success: true });
}
