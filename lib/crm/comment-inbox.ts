import { Prisma, type Contact, type ConversationChannel } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Shared find-or-create core for matching a contact by a per-channel external
 * id. `findExisting` must query on the same unique index `createData` would
 * violate, so a race between two concurrent webhook deliveries for a brand
 * new contact resolves to one winner instead of two contact rows.
 */
async function findOrCreateContact(
  findExisting: () => Promise<Contact | null>,
  createData: Prisma.ContactUncheckedCreateInput,
  updateIfChanged: (existing: Contact) => Prisma.ContactUpdateInput | null
): Promise<Contact> {
  const existing = await findExisting();
  if (existing) {
    const update = updateIfChanged(existing);
    if (update) return prisma.contact.update({ where: { id: existing.id }, data: update });
    return existing;
  }

  try {
    return await prisma.contact.create({ data: createData });
  } catch (error) {
    // Two events from the same new contact processed concurrently can both
    // reach create() before either commits. Whoever loses re-reads.
    if (isUniqueConstraintError(error)) {
      const winner = await findExisting();
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Find the contact for an Instagram user in this workspace, creating one if
 * this is the first time we've seen them. This is the same match key used
 * everywhere else in the CRM: `(workspaceId, instagramUserId)`, enforced by a
 * unique index so a person is never split into two contacts.
 */
function findOrCreateContactByInstagramUser(
  workspaceId: string,
  instagramUserId: string,
  username: string | undefined
) {
  return findOrCreateContact(
    () =>
      prisma.contact.findUnique({
        where: { workspaceId_instagramUserId: { workspaceId, instagramUserId } },
      }),
    {
      workspaceId,
      instagramUserId,
      instagramUsername: username ?? null,
      name: username ?? null,
      originChannel: "INSTAGRAM",
    },
    // Usernames change; keep it current, but never clobber a name the team
    // may have already edited by hand.
    (existing) => (username && existing.instagramUsername !== username ? { instagramUsername: username } : null)
  );
}

/**
 * Same idea as above, matched on the Facebook Page-scoped ID (PSID) a
 * Messenger conversation or Page-post comment carries.
 */
function findOrCreateContactByFacebookPsid(
  workspaceId: string,
  facebookPsid: string,
  name: string | undefined
) {
  return findOrCreateContact(
    () =>
      prisma.contact.findUnique({
        where: { workspaceId_facebookPsid: { workspaceId, facebookPsid } },
      }),
    {
      workspaceId,
      facebookPsid,
      name: name ?? null,
      originChannel: "FACEBOOK",
    },
    (existing) => (name && existing.name !== name ? { name } : null)
  );
}

/**
 * Record one inbound message into the CRM's unified inbox: one Conversation
 * per (contact, channel) that every message from that person appends a
 * Message to. Idempotent on the provider's own message/comment id, so
 * webhook redelivery and a backfill rerun never duplicate it.
 */
async function recordInboundMessage({
  workspaceId,
  contactId,
  channel,
  externalId,
  body,
  senderName,
  occurredAt,
}: {
  workspaceId: string;
  contactId: string;
  channel: ConversationChannel;
  externalId: string;
  body: string;
  senderName?: string;
  occurredAt: Date;
}): Promise<void> {
  const conversation = await prisma.conversation.upsert({
    where: { contactId_channel: { contactId, channel } },
    create: { workspaceId, contactId, channel, lastMessageAt: occurredAt },
    update: {},
  });

  // A backfill can arrive out of order relative to messages already recorded
  // live; only move lastMessageAt forward, never back.
  if (!conversation.lastMessageAt || conversation.lastMessageAt < occurredAt) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: occurredAt },
    });
  }

  await prisma.message.upsert({
    where: { conversationId_externalId: { conversationId: conversation.id, externalId } },
    create: {
      conversationId: conversation.id,
      direction: "IN",
      body,
      senderName: senderName ?? null,
      sentAt: occurredAt,
      externalId,
    },
    update: {},
  });
}

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
  await recordInboundMessage({
    workspaceId,
    contactId: contact.id,
    channel: "INSTAGRAM_COMMENT",
    externalId: commentId,
    body: commentText,
    senderName: commenterName,
    occurredAt,
  });
}

export async function recordFacebookMessage({
  workspaceId,
  senderId,
  messageId,
  messageText,
  occurredAt,
}: {
  workspaceId: string;
  senderId: string;
  messageId: string;
  messageText: string;
  occurredAt: Date;
}): Promise<void> {
  const contact = await findOrCreateContactByFacebookPsid(workspaceId, senderId, undefined);
  await recordInboundMessage({
    workspaceId,
    contactId: contact.id,
    channel: "FACEBOOK",
    externalId: messageId,
    body: messageText,
    occurredAt,
  });
}

export async function recordFacebookComment({
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
  const contact = await findOrCreateContactByFacebookPsid(workspaceId, commenterId, commenterName);
  await recordInboundMessage({
    workspaceId,
    contactId: contact.id,
    channel: "FACEBOOK",
    externalId: commentId,
    body: commentText,
    senderName: commenterName,
    occurredAt,
  });
}
