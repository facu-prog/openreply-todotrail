"use client";

/**
 * CRM Inbox
 *
 * One channel-tabbed inbox. Instagram DM reuses the existing Instagram inbox
 * component as-is — it already reads and sends live against the Meta Graph
 * API, so there is nothing to duplicate here. The other five channels are
 * real, DB-backed conversation lists (Conversation/Message) that are simply
 * empty until each channel's integration ships and starts writing to them.
 */

import { useEffect, useState } from "react";
import InstagramInbox from "@/components/instagram-inbox";

type ChannelTab = {
  key: string;
  label: string;
  channel: "INSTAGRAM_COMMENT" | "FACEBOOK" | "WHATSAPP" | "TIKTOK" | "EMAIL";
  emptyHint: string;
};

const CHANNEL_TABS: ChannelTab[] = [
  {
    key: "instagram_comment",
    label: "Instagram Comments",
    channel: "INSTAGRAM_COMMENT",
    emptyHint:
      "New comments show up here automatically. If you connected Instagram before this tab existed, use Backfill to pull in comment history already on file.",
  },
  {
    key: "facebook",
    label: "Facebook",
    channel: "FACEBOOK",
    emptyHint:
      "Messenger DMs and Page-post comments show up here once a Facebook Page is connected in Settings — new activity populates automatically.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    channel: "WHATSAPP",
    emptyHint: "Connect WhatsApp Business to start receiving messages here.",
  },
  {
    key: "tiktok",
    label: "TikTok",
    channel: "TIKTOK",
    emptyHint: "Connect TikTok to start receiving messages here.",
  },
  {
    key: "email",
    label: "Email",
    channel: "EMAIL",
    emptyHint: "Connect a mailbox to start receiving emails here.",
  },
];

type ConversationSummary = {
  id: string;
  contact: { id: string; name: string | null } | null;
  lastMessageAt: string | null;
  lastMessage: { body: string; direction: "IN" | "OUT" } | null;
};

function ChannelInbox({ tab, refreshToken }: { tab: ChannelTab; refreshToken: number }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; body: string; direction: string; sentAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setActiveId(null);
    setMessages([]);
    fetch(`/api/crm/inbox/conversations?channel=${tab.channel}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setConversations(d.data.conversations);
      })
      .finally(() => setLoading(false));
  }, [tab.channel, refreshToken]);

  useEffect(() => {
    if (!activeId) return;
    fetch(`/api/crm/inbox/conversations/${activeId}`)
      .then((r) => r.json())
      .then((d) => d.success && setMessages(d.data.messages));
  }, [activeId]);

  return (
    <div className="grid h-[calc(100dvh-14rem)] grid-cols-1 overflow-hidden rounded border border-border sm:grid-cols-[300px_1fr]">
      <div className="flex min-h-0 flex-col border-b border-border sm:border-b-0 sm:border-r">
        <div className="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
          Conversations
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-6 text-sm text-muted">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted">
              <p>No {tab.label.toLowerCase()} conversations yet.</p>
              <p className="mt-2 text-xs">{tab.emptyHint}</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveId(c.id)}
                className={`block w-full border-b border-border px-4 py-3 text-left ${
                  activeId === c.id ? "bg-surface-hover" : "hover:bg-surface-hover"
                }`}
              >
                <div className="text-sm font-medium text-foreground">{c.contact?.name ?? "Unknown contact"}</div>
                {c.lastMessage && (
                  <p className="mt-0.5 truncate text-xs text-muted">{c.lastMessage.body}</p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        {!activeId ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
            Select a conversation to read it.
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    m.direction === "OUT"
                      ? "bg-accent text-white"
                      : "border border-border bg-surface text-foreground"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrmInboxPage() {
  const [activeTab, setActiveTab] = useState<"instagram_dm" | string>("instagram_dm");
  const [refreshToken, setRefreshToken] = useState(0);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  async function runBackfill() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/crm/inbox/backfill-instagram-comments", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setBackfillResult(`Scanned ${data.data.scanned} webhook events, recorded ${data.data.recorded} comments.`);
        setRefreshToken((n) => n + 1);
      } else {
        setBackfillResult(data.error ?? "Backfill failed.");
      }
    } catch {
      setBackfillResult("Backfill failed.");
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">CRM Inbox</h1>
        {activeTab === "instagram_comment" && (
          <div className="flex items-center gap-2">
            {backfillResult && <span className="text-xs text-muted">{backfillResult}</span>}
            <button
              type="button"
              onClick={() => void runBackfill()}
              disabled={backfilling}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              {backfilling ? "Backfilling…" : "Backfill from webhook history"}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("instagram_dm")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            activeTab === "instagram_dm" ? "bg-accent text-white" : "text-muted hover:text-foreground"
          }`}
        >
          Instagram DM
        </button>
        {CHANNEL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              activeTab === tab.key ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "instagram_dm" ? (
        <InstagramInbox showHeading={false} />
      ) : (
        <ChannelInbox
          tab={CHANNEL_TABS.find((t) => t.key === activeTab)!}
          refreshToken={refreshToken}
        />
      )}
    </div>
  );
}
