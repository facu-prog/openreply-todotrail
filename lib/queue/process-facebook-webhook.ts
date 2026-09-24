import { prisma } from "@/lib/db/client";
import { Prisma } from "@/app/generated/prisma/client";
import { parseFacebookFeedCommentEvents, parseFacebookMessageEvents } from "@/lib/meta/facebook-webhook";
import { recordFacebookComment, recordFacebookMessage } from "@/lib/crm/comment-inbox";

type FacebookPayload = Parameters<typeof parseFacebookMessageEvents>[0];

/**
 * Handles `object: "page"` webhook deliveries: Messenger DMs and Page-post
 * comments, both recorded into the CRM's unified inbox under the `facebook`
 * channel. Read-only population for this pass — no reply-sending, so unlike
 * processInstagramWebhook this never touches the DM send queue.
 */
export async function processFacebookPageWebhook({
  payload: incoming,
}: {
  payload: FacebookPayload;
}) {
  if (incoming.object !== "page" || !Array.isArray(incoming.entry)) return;

  const pages = await prisma.facebookPage.findMany({
    where: { pageId: { in: incoming.entry.map((e) => e.id) } },
    select: { pageId: true, workspaceId: true },
  });
  const pageMap = new Map(pages.map((p) => [p.pageId, p]));
  const allowed = new Set(pageMap.keys());
  const payload = { ...incoming, entry: incoming.entry.filter((e) => allowed.has(e.id)) };
  if (!payload.entry.length) return;

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      object: "page",
      payload: payload as unknown as Prisma.InputJsonValue,
      status: "PENDING",
    },
  });

  try {
    for (const event of parseFacebookMessageEvents(payload)) {
      const page = pageMap.get(event.pageId);
      if (!page) continue;
      await recordFacebookMessage({
        workspaceId: page.workspaceId,
        senderId: event.senderId,
        messageId: event.messageId,
        messageText: event.messageText,
        occurredAt: new Date(event.time),
      }).catch((error) => logCrmFailure(page.workspaceId, "message", error));
    }

    for (const event of parseFacebookFeedCommentEvents(payload)) {
      const page = pageMap.get(event.pageId);
      if (!page) continue;
      await recordFacebookComment({
        workspaceId: page.workspaceId,
        commentId: event.commentId,
        commentText: event.commentText,
        commenterId: event.commenterId,
        commenterName: event.commenterName,
        occurredAt: new Date(event.time * 1000),
      }).catch((error) => logCrmFailure(page.workspaceId, "comment", error));
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "FAILED", errorMessage: message, processedAt: new Date() },
    });
    throw error;
  }
}

function logCrmFailure(workspaceId: string, kind: "message" | "comment", error: unknown) {
  return prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level: "WARNING",
        workspaceId,
        message: `Failed to record CRM Facebook ${kind}`,
        payload: { reason: error instanceof Error ? error.message : String(error) },
      },
    })
    .catch(() => {});
}
