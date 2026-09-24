import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Find the contact for an Instagram user in this workspace, creating one if
 * this is the first time we've seen them. This is the same match key used
 * everywhere else in the CRM: `(workspaceId, instagramUserId)`, now enforced
 * by a unique index so a person is never split into two contacts.
 */
async function findOrCreateContactByInstagramUser(
  workspaceId: string,
  instagramUserId: string,
  username: string | undefined
) {
  const existing = await prisma.contact.findUnique({
    where: { workspaceId_instagramUserId: { workspaceId, instagramUserId } },
  });
  if (existing) {
    // Usernames change; keep it current, but never clobber a name the team
    // may have already edited by hand.
    if (username && existing.instagramUsername !== username) {
      return prisma.contact.update({
        where: { id: existing.id },
        data: { instagramUsername: username },
      });
    }
    return existing;
  }

  try {
    return await prisma.contact.create({
      data: {
        workspaceId,
        instagramUserId,
        instagramUsername: username ?? null,
        name: username ?? null,
        originChannel: "INSTAGRAM",
      },
    });
  } catch (error) {
    // Two comments from the same new contact processed concurrently can both
    // reach the create() before either commits. Whoever loses re-reads.
    if (isUniqueConstraintError(error)) {
      const winner = await prisma.contact.findUnique({
        where: { workspaceId_instagramUserId: { workspaceId, instagramUserId } },
      });
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Record an Instagram comment into the CRM's unified inbox: one Conversation
 * per (contact, instagram_comment) that every comment from that person
 * appends a Message to, same shape as a DM thread. Idempotent on the
 * comment's own id, so webhook redelivery and the backfill script below can
 * both call this freely without creating duplicates.
 */
export async function recordInstagramComment({
  workspaceId,
  commentId,
  commentText,
  commenterId,
  commenterName,
  occurredAt,
}: {
  workspaceId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  occurredAt: Date;
}): Promise<void> {
  const contact = await findOrCreateContactByInstagramUser(workspaceId, commenterId, commenterName);

  const conversation = await prisma.conversation.upsert({
    where: { contactId_channel: { contactId: contact.id, channel: "INSTAGRAM_COMMENT" } },
    create: {
      workspaceId,
      contactId: contact.id,
      channel: "INSTAGRAM_COMMENT",
      lastMessageAt: occurredAt,
    },
    update: {},
  });

  // A backfill can arrive out of order relative to comments already recorded
  // live; only move lastMessageAt forward, never back.
  if (!conversation.lastMessageAt || conversation.lastMessageAt < occurredAt) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: occurredAt },
    });
  }

  await prisma.message.upsert({
    where: { conversationId_externalId: { conversationId: conversation.id, externalId: commentId } },
    create: {
      conversationId: conversation.id,
      direction: "IN",
      body: commentText,
      senderName: commenterName ?? null,
      sentAt: occurredAt,
      externalId: commentId,
    },
    update: {},
  });
}
