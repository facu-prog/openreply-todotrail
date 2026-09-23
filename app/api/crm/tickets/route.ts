import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ensureCrmDefaults } from "@/lib/crm/defaults";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const pipelineKey = typeof body?.pipelineKey === "string" ? body.pipelineKey : "";
  if (!pipelineKey) {
    return NextResponse.json({ success: false, error: "pipelineKey is required" }, { status: 400 });
  }

  await ensureCrmDefaults(workspaceId);

  const pipeline = await prisma.pipeline.findUnique({
    where: { workspaceId_key: { workspaceId, key: pipelineKey } },
    include: { stages: { orderBy: { order: "asc" }, take: 1 } },
  });
  if (!pipeline || !pipeline.stages[0]) {
    return NextResponse.json({ success: false, error: "Pipeline not found" }, { status: 404 });
  }

  const ticket = await prisma.ticket.create({
    data: {
      workspaceId,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      contactId: typeof body?.contactId === "string" && body.contactId ? body.contactId : null,
      title: typeof body?.title === "string" && body.title.trim() ? body.title.trim() : null,
      assignedUserId:
        typeof body?.assignedUserId === "string" && body.assignedUserId ? body.assignedUserId : null,
      complaintTypeId:
        typeof body?.complaintTypeId === "string" && body.complaintTypeId ? body.complaintTypeId : null,
    },
    include: {
      contact: { select: { id: true, name: true, instagramUsername: true, whatsappPhone: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
      complaintType: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ success: true, data: ticket });
}
