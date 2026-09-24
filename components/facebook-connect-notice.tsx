"use client";

// Mirrors components/instagram-connect-notice.tsx, in plain English rather
// than through the i18n catalog — the Facebook connection UI ships English
// only for this pass, same as the rest of the new CRM surface.

import { useSearchParams } from "next/navigation";

type Tone = "error" | "warning" | "success";

const TONE_CLASSES: Record<Tone, string> = {
  error: "border-error/20 bg-error/10 text-error",
  warning: "border-warning/20 bg-warning/10 text-warning",
  success: "border-success/20 bg-success/10 text-success",
};

const MESSAGES: Record<string, { tone: Tone; title: string; detail: string }> = {
  denied: {
    tone: "warning",
    title: "Facebook connection cancelled",
    detail: "You declined the permission prompt on Facebook. Start again and accept all requested permissions.",
  },
  invalid: {
    tone: "error",
    title: "Facebook connection expired",
    detail: "The login link was missing or older than 10 minutes. Click Connect Facebook Page to start a fresh attempt.",
  },
  forbidden: {
    tone: "error",
    title: "Not permitted",
    detail: "Only workspace owners and admins can connect a Facebook Page.",
  },
  no_pages: {
    tone: "warning",
    title: "No Facebook Pages found",
    detail: "That Facebook account doesn't manage any Pages. Make sure you're an admin of the Page you want to connect.",
  },
  connected: {
    tone: "success",
    title: "Facebook Page connected",
    detail: "New Messenger conversations and Page-post comments will show up in the CRM inbox.",
  },
};

export function FacebookConnectNotice() {
  const searchParams = useSearchParams();
  const status = searchParams.get("facebook");

  if (!status) return null;

  if (status === "misconfigured") {
    const missing = (searchParams.get("missing") ?? "").split(",").filter(Boolean);
    return (
      <Notice tone="error" title="Facebook app not configured">
        <p>
          Set {missing.length > 0 ? "these environment variables" : "the required environment variables"} and restart
          the server:
        </p>
        {missing.length > 0 && (
          <ul className="mt-2 space-y-1">
            {missing.map((name) => (
              <li key={name} className="font-mono text-xs">
                {name}
              </li>
            ))}
          </ul>
        )}
      </Notice>
    );
  }

  if (status === "failed") {
    const reason = searchParams.get("reason");
    return (
      <Notice tone="error" title="Facebook connection failed">
        <p>
          Facebook accepted the login but the connection could not be completed. This is usually a mismatched
          redirect URI or an app missing the required permissions.
        </p>
        {reason && <p className="mt-2 font-mono text-xs break-words opacity-80">{reason}</p>}
      </Notice>
    );
  }

  if (status === "choose") return null; // handled by the page picker itself

  const known = MESSAGES[status];
  if (!known) return null;

  return (
    <Notice tone={known.tone} title={known.title}>
      <p>{known.detail}</p>
    </Notice>
  );
}

function Notice({ tone, title, children }: { tone: Tone; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded border p-4 text-sm ${TONE_CLASSES[tone]}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-1 opacity-90">{children}</div>
    </div>
  );
}
