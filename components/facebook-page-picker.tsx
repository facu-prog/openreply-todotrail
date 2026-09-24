"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Shown when the connecting Facebook account manages more than one Page.
 * Reads the candidate list from the short-lived signed cookie the callback
 * set (see lib/meta/facebook-oauth.ts), then finalizes the chosen one.
 */
export function FacebookPagePicker({ onConnected }: { onConnected: () => void }) {
  const searchParams = useSearchParams();
  const [pages, setPages] = useState<{ id: string; name: string }[] | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("facebook") !== "choose") return;
    fetch("/api/facebook/pending-pages")
      .then((r) => r.json())
      .then((d) => d.success && setPages(d.data.pages));
  }, [searchParams]);

  if (searchParams.get("facebook") !== "choose" || !pages) return null;

  async function selectPage(pageId: string) {
    setSelecting(pageId);
    setError(null);
    const res = await fetch("/api/facebook/select-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId }),
    });
    const data = await res.json();
    if (data.success) {
      onConnected();
    } else {
      setError(data.error ?? "Could not connect that Page.");
      setSelecting(null);
    }
  }

  return (
    <div className="rounded border border-border bg-surface/70 p-4 text-sm">
      <p className="font-medium text-foreground">Choose which Facebook Page to connect</p>
      <p className="mt-1 text-xs text-muted">
        This account manages more than one Page. Pick the one you want in the CRM inbox.
      </p>
      <div className="mt-3 space-y-2">
        {pages.length === 0 && <p className="text-xs text-muted">This selection expired — reconnect Facebook.</p>}
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => void selectPage(page.id)}
            disabled={selecting !== null}
            className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-left text-sm hover:bg-surface-hover disabled:opacity-50"
          >
            <span>{page.name}</span>
            <span className="text-xs text-muted">{selecting === page.id ? "Connecting…" : "Connect"}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
