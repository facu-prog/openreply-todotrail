import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { parseCommentEvents } from "@/lib/meta/webhook";
import { recordInstagramComment } from "@/lib/crm/comment-inbox";

export const runtime = "nodejs";

/**
 * One-off backfill: replays every stored WebhookEvent's comment data through
 * the same recordInstagramComment() the live webhook path uses, so a
 * workspace that connected Instagram before the CRM shipped gets its
 * historical comments into the unified inbox too. Safe to run more than
 * once — recording is idempotent on the comment id.
 *
 * Scoped to the current workspace: only WebhookEvent rows whose entries
 * belong to one of this workspace's connected Instagram accounts are used,
 * regardless of what the row's own (nullable, sometimes-stale) workspaceId
 * column says.
 */
export async function POST() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId },
    select: { instagramId: true },
  });
  const ownAccountIds = new Set(accounts.map((a) => a.instagramId));
  if (ownAccountIds.size === 0) {
    return NextResponse.json({ success: true, data: { scanned: 0, recorded: 0 } });
  }

  let scanned = 0;
  let recorded = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.webhookEvent.findMany({
      where: { object: "instagram" },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned += 1;
      let events;
      try {
        events = parseCommentEvents(
          row.payload as unknown as Parameters<typeof parseCommentEvents>[0]
        );
      } catch {
        continue;
      }
      for (const event of events) {
        if (!ownAccountIds.has(event.instagramAccountId)) continue;
        await recordInstagramComment({
          workspaceId,
          commentId: event.commentId,
          commentText: event.commentText,
          commenterId: event.commenterId,
          commenterName: event.commenterName,
          occurredAt: new Date(event.time * 1000),
        });
        recorded += 1;
      }
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < 200) break;
  }

  return NextResponse.json({ success: true, data: { scanned, recorded } });
}
