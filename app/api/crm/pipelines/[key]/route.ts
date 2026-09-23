import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ensureCrmDefaults } from "@/lib/crm/defaults";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { key } = await params;

  // Defensive, idempotent seed: backfills workspaces created before the CRM
  // shipped, on their first visit to a pipeline board.
  await ensureCrmDefaults(workspaceId);

  const pipeline = await prisma.pipeline.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          tickets: {
            orderBy: { updatedAt: "desc" },
            include: {
              contact: { select: { id: true, name: true, instagramUsername: true, whatsappPhone: true } },
              assignedUser: { select: { id: true, name: true, email: true } },
              complaintType: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!pipeline) {
    return NextResponse.json({ success: false, error: "Pipeline not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: pipeline });
}
