import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import type { ConversationChannel } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

// INSTAGRAM_DM is intentionally not served here — the existing Instagram
// inbox (/api/instagram/conversations) already reads it live from the Meta
// Graph API with no local copy. See the note in prisma/schema.prisma.
const DB_BACKED_CHANNELS: ConversationChannel[] = [
  "INSTAGRAM_COMMENT",
  "FACEBOOK",
  "WHATSAPP",
  "TIKTOK",
  "EMAIL",
];

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const channel = request.nextUrl.searchParams.get("channel") as ConversationChannel | null;
  if (!channel || !DB_BACKED_CHANNELS.includes(channel)) {
    return NextResponse.json({ success: false, error: "Unsupported channel" }, { status: 400 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { workspaceId, channel },
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: { select: { id: true, name: true, whatsappPhone: true, email: true, tiktokHandle: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      conversations: conversations.map((c) => ({
        id: c.id,
        contact: c.contact,
        lastMessageAt: c.lastMessageAt,
        lastMessage: c.messages[0] ?? null,
      })),
    },
  });
}
