import { describe, expect, it } from "vitest";
import { parseFacebookFeedCommentEvents, parseFacebookMessageEvents } from "../lib/meta/facebook-webhook";

describe("parseFacebookMessageEvents", () => {
  function messagingPayload(messaging: unknown[]) {
    return {
      object: "page",
      entry: [{ id: "page_123", time: 1234567890, messaging }],
    } as Parameters<typeof parseFacebookMessageEvents>[0];
  }

  it("parses a valid Messenger message", () => {
    const events = parseFacebookMessageEvents(
      messagingPayload([
        {
          sender: { id: "psid_1" },
          recipient: { id: "page_123" },
          timestamp: 1758000000000,
          message: { mid: "mid_1", text: "Hola!" },
        },
      ])
    );
    expect(events).toEqual([
      { pageId: "page_123", messageId: "mid_1", messageText: "Hola!", senderId: "psid_1", time: 1758000000000 },
    ]);
  });

  it("ignores echoes, deleted, and unsupported messages", () => {
    const events = parseFacebookMessageEvents(
      messagingPayload([
        { sender: { id: "page_123" }, recipient: { id: "psid_1" }, message: { mid: "m1", text: "hi", is_echo: true } },
        { sender: { id: "psid_1" }, recipient: { id: "page_123" }, message: { mid: "m2", text: "hi", is_deleted: true } },
        { sender: { id: "psid_1" }, recipient: { id: "page_123" }, message: { mid: "m3", text: "hi", is_unsupported: true } },
      ])
    );
    expect(events).toHaveLength(0);
  });

  it("ignores the Page messaging itself", () => {
    const events = parseFacebookMessageEvents(
      messagingPayload([
        { sender: { id: "page_123" }, recipient: { id: "page_123" }, message: { mid: "m1", text: "hi" } },
      ])
    );
    expect(events).toHaveLength(0);
  });

  it("ignores non-page objects", () => {
    const payload = { object: "instagram", entry: [{ id: "page_123", time: 1, messaging: [] }] };
    expect(parseFacebookMessageEvents(payload as Parameters<typeof parseFacebookMessageEvents>[0])).toHaveLength(0);
  });
});

describe("parseFacebookFeedCommentEvents", () => {
  function feedPayload(value: Record<string, unknown>) {
    return {
      object: "page",
      entry: [{ id: "page_123", time: 1234567890, changes: [{ field: "feed", value }] }],
    } as Parameters<typeof parseFacebookFeedCommentEvents>[0];
  }

  it("parses a new comment on a Page post", () => {
    const events = parseFacebookFeedCommentEvents(
      feedPayload({
        item: "comment",
        verb: "add",
        comment_id: "comment_1",
        post_id: "post_1",
        message: "Do you have this in size 42?",
        created_time: 1758000000,
        from: { id: "user_1", name: "Maya" },
      })
    );
    expect(events).toEqual([
      {
        pageId: "page_123",
        commentId: "comment_1",
        postId: "post_1",
        commentText: "Do you have this in size 42?",
        commenterId: "user_1",
        commenterName: "Maya",
        time: 1758000000,
      },
    ]);
  });

  it("ignores feed items that are not a new comment", () => {
    expect(
      parseFacebookFeedCommentEvents(feedPayload({ item: "status", verb: "add", from: { id: "user_1" } }))
    ).toHaveLength(0);
    expect(
      parseFacebookFeedCommentEvents(
        feedPayload({ item: "comment", verb: "remove", comment_id: "c1", from: { id: "user_1" } })
      )
    ).toHaveLength(0);
  });

  it("ignores comments the Page itself posted", () => {
    const events = parseFacebookFeedCommentEvents(
      feedPayload({ item: "comment", verb: "add", comment_id: "c1", from: { id: "page_123" } })
    );
    expect(events).toHaveLength(0);
  });
});
