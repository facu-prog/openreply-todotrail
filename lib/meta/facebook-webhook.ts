// Facebook Page webhook parsing. Kept separate from lib/meta/webhook.ts's
// Instagram parsers because the payload shapes only partly overlap (the
// `messaging` array is the same Messenger Platform format Instagram DMs use;
// the Page's `feed` field for post comments has no Instagram equivalent) —
// signature verification and the top-level route stay shared.

interface FacebookWebhookEntry {
  id: string;
  time: number;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    timestamp?: number;
    message?: {
      mid?: string;
      text?: string;
      is_echo?: boolean;
      is_deleted?: boolean;
      is_unsupported?: boolean;
    };
  }>;
  changes?: Array<{
    field: string;
    value: {
      item?: string;
      verb?: string;
      comment_id?: string;
      post_id?: string;
      message?: string;
      created_time?: number;
      from?: { id?: string; name?: string };
    };
  }>;
}

interface FacebookWebhookPayload {
  object: string;
  entry: FacebookWebhookEntry[];
}

export interface FacebookMessageEvent {
  pageId: string;
  messageId: string;
  messageText: string;
  senderId: string;
  /** Unix ms from the messaging event. */
  time: number;
}

export function parseFacebookMessageEvents(payload: FacebookWebhookPayload): FacebookMessageEvent[] {
  const events: FacebookMessageEvent[] = [];
  if (payload.object !== "page") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const message = messaging.message;
      if (!message) continue;
      if (message.is_echo || message.is_deleted || message.is_unsupported) continue;

      const text = message.text?.trim();
      const messageId = message.mid;
      const senderId = messaging.sender?.id;
      const pageId = entry.id ?? messaging.recipient?.id;
      if (!text || !messageId || !senderId || !pageId) continue;
      if (senderId === pageId) continue;

      events.push({
        pageId,
        messageId,
        messageText: text,
        senderId,
        time: messaging.timestamp ?? entry.time * 1000,
      });
    }
  }

  return events;
}

export interface FacebookFeedCommentEvent {
  pageId: string;
  commentId: string;
  postId?: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  /** Unix seconds. */
  time: number;
}

export function parseFacebookFeedCommentEvents(
  payload: FacebookWebhookPayload
): FacebookFeedCommentEvent[] {
  const events: FacebookFeedCommentEvent[] = [];
  if (payload.object !== "page") return events;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "feed") continue;
      const value = change.value;
      // `feed` also fires for new posts, likes, and reactions; only "add" on
      // a "comment" item is a new comment. Edits/removals are skipped for
      // this inbound-only pass.
      if (value.item !== "comment" || value.verb !== "add") continue;

      const commentId = value.comment_id;
      const commenterId = value.from?.id;
      if (!entry.id || !commentId || !commenterId) continue;
      // Skip the Page's own comments (e.g. a reply the team already posted).
      if (commenterId === entry.id) continue;

      events.push({
        pageId: entry.id,
        commentId,
        postId: value.post_id,
        commentText: value.message ?? "",
        commenterId,
        commenterName: value.from?.name,
        time: value.created_time ?? entry.time,
      });
    }
  }

  return events;
}
