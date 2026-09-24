import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    contact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversation: { upsert: vi.fn(), update: vi.fn() },
    message: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/app/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    },
  },
}));

import { recordInstagramComment } from "../lib/crm/comment-inbox";

const occurredAt = new Date("2026-09-01T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.conversation.upsert.mockResolvedValue({
    id: "conversation_1",
    lastMessageAt: null,
  });
});

describe("recordInstagramComment", () => {
  it("creates a new contact matched on (workspaceId, instagramUserId) when none exists", async () => {
    mockPrisma.contact.findUnique.mockResolvedValue(null);
    mockPrisma.contact.create.mockResolvedValue({ id: "contact_1" });

    await recordInstagramComment({
      workspaceId: "workspace_1",
      commentId: "comment_1",
      commentText: "LINK",
      commenterId: "ig_user_1",
      commenterName: "maya",
      occurredAt,
    });

    expect(mockPrisma.contact.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        instagramUserId: "ig_user_1",
        instagramUsername: "maya",
        name: "maya",
        originChannel: "INSTAGRAM",
      },
    });
  });

  it("reuses the existing contact instead of creating a duplicate", async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      instagramUsername: "maya",
    });

    await recordInstagramComment({
      workspaceId: "workspace_1",
      commentId: "comment_1",
      commentText: "LINK",
      commenterId: "ig_user_1",
      commenterName: "maya",
      occurredAt,
    });

    expect(mockPrisma.contact.create).not.toHaveBeenCalled();
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
  });

  it("refreshes a changed Instagram username without touching other fields", async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact_1",
      instagramUsername: "old_handle",
    });
    mockPrisma.contact.update.mockResolvedValue({ id: "contact_1" });

    await recordInstagramComment({
      workspaceId: "workspace_1",
      commentId: "comment_1",
      commentText: "LINK",
      commenterId: "ig_user_1",
      commenterName: "new_handle",
      occurredAt,
    });

    expect(mockPrisma.contact.update).toHaveBeenCalledWith({
      where: { id: "contact_1" },
      data: { instagramUsername: "new_handle" },
    });
  });

  it("upserts one conversation per contact for the instagram_comment channel", async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({ id: "contact_1", instagramUsername: "maya" });

    await recordInstagramComment({
      workspaceId: "workspace_1",
      commentId: "comment_1",
      commentText: "LINK",
      commenterId: "ig_user_1",
      commenterName: "maya",
      occurredAt,
    });

    expect(mockPrisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contactId_channel: { contactId: "contact_1", channel: "INSTAGRAM_COMMENT" } },
      })
    );
  });

  it("upserts the message keyed by the comment id, so redelivery never duplicates it", async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({ id: "contact_1", instagramUsername: "maya" });

    await recordInstagramComment({
      workspaceId: "workspace_1",
      commentId: "comment_1",
      commentText: "LINK",
      commenterId: "ig_user_1",
      commenterName: "maya",
      occurredAt,
    });

    expect(mockPrisma.message.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId_externalId: { conversationId: "conversation_1", externalId: "comment_1" } },
        create: expect.objectContaining({
          direction: "IN",
          body: "LINK",
          externalId: "comment_1",
        }),
      })
    );
  });

  it("advances lastMessageAt for a newer comment but never regresses it for an older backfilled one", async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({ id: "contact_1", instagramUsername: "maya" });
    mockPrisma.conversation.upsert.mockResolvedValue({
      id: "conversation_1",
      lastMessageAt: new Date("2026-09-05T00:00:00Z"),
    });

    await recordInstagramComment({
      workspaceId: "workspace_1",
      commentId: "old_comment",
      commentText: "older",
      commenterId: "ig_user_1",
      occurredAt: new Date("2026-09-01T00:00:00Z"), // older than the stored lastMessageAt
    });

    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });
});
