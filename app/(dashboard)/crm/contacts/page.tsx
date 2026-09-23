"use client";

/**
 * CRM Contacts
 *
 * Unifies a person across channels (Instagram, WhatsApp, Facebook, TikTok,
 * email), with the lead fields the team already tracks in Kommo today, tags,
 * and filtering — the segmentation groundwork for later outbound campaigns.
 */

import { useCallback, useEffect, useState } from "react";

type Member = { id: string; user: { id: string; name: string | null; email: string | null } };
type Tag = { id: string; name: string; color: string | null };
type Contact = {
  id: string;
  name: string | null;
  instagramUsername: string | null;
  whatsappPhone: string | null;
  tiktokHandle: string | null;
  email: string | null;
  originChannel: string | null;
  budget: number | null;
  orderLink: string | null;
  brandInterest: string | null;
  shoeSizeUs: number | null;
  shoeSizeCm: number | null;
  tiendaNubeOrderNumber: string | null;
  productsInterest: string[];
  assignedUserId: string | null;
  assignedUser: { id: string; name: string | null; email: string | null } | null;
  tags: { tag: Tag }[];
};

const CHANNELS = ["INSTAGRAM", "WHATSAPP", "FACEBOOK", "TIKTOK", "EMAIL"] as const;

const emptyForm = {
  name: "",
  email: "",
  instagramUsername: "",
  whatsappPhone: "",
  facebookPsid: "",
  tiktokHandle: "",
  originChannel: "",
  budget: "",
  orderLink: "",
  brandInterest: "",
  shoeSizeUs: "",
  shoeSizeCm: "",
  tiendaNubeOrderNumber: "",
  productsInterest: "",
  assignedUserId: "",
};

const inputClass =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/40";
const selectClass = inputClass;
const labelClass = "flex flex-col gap-1 text-xs text-muted";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [tagId, setTagId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});

  const refreshTags = useCallback(() => {
    fetch("/api/crm/tags")
      .then((r) => r.json())
      .then((d) => d.success && setTags(d.data))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      const params = new URLSearchParams({ offset: String(nextOffset) });
      if (q) params.set("q", q);
      if (channel) params.set("channel", channel);
      if (tagId) params.set("tagId", tagId);
      if (assignedUserId) params.set("assignedUserId", assignedUserId);
      const res = await fetch(`/api/crm/contacts?${params}`);
      const data = await res.json();
      if (data.success) {
        setContacts((prev) => (nextOffset === 0 ? data.data.contacts : [...prev, ...data.data.contacts]));
        setTotal(data.data.total);
        setOffset(nextOffset);
      }
      setLoading(false);
    },
    [q, channel, tagId, assignedUserId]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((d) => d.success && setMembers(d.data.members))
      .catch(() => {});
    refreshTags();
  }, [refreshTags]);

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      budget: form.budget || undefined,
      shoeSizeUs: form.shoeSizeUs || undefined,
      shoeSizeCm: form.shoeSizeCm || undefined,
      productsInterest: form.productsInterest
        ? form.productsInterest.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    };
    const res = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setShowForm(false);
      setForm(emptyForm);
      void load(0);
    }
  }

  async function addTag(contactId: string) {
    const name = (tagDraft[contactId] ?? "").trim();
    if (!name) return;
    const res = await fetch(`/api/crm/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setTagDraft((prev) => ({ ...prev, [contactId]: "" }));
      void load(offset);
      refreshTags();
    }
  }

  async function removeTag(contactId: string, tagIdToRemove: string) {
    await fetch(`/api/crm/contacts/${contactId}/tags?tagId=${tagIdToRemove}`, { method: "DELETE" });
    void load(offset);
  }

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          New contact
        </button>
      </div>

      <div className="panel flex flex-wrap gap-3 rounded p-4">
        <input
          placeholder="Search name, email, phone, username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`${inputClass} min-w-56 flex-1`}
        />
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={selectClass}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={tagId} onChange={(e) => setTagId(e.target.value)} className={selectClass}>
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <select
          value={assignedUserId}
          onChange={(e) => setAssignedUserId(e.target.value)}
          className={selectClass}
        >
          <option value="">Anyone assigned</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.name ?? m.user.email}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center text-xs text-muted">{total} contacts</span>
      </div>

      <div className="panel overflow-x-auto rounded">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Channels</th>
              <th className="px-3 py-2">Origin</th>
              <th className="px-3 py-2">Budget</th>
              <th className="px-3 py-2">Talle</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{c.name ?? "—"}</div>
                  <div className="text-xs text-muted">{c.email ?? ""}</div>
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {[
                    c.instagramUsername && `IG @${c.instagramUsername}`,
                    c.whatsappPhone && `WA ${c.whatsappPhone}`,
                    c.tiktokHandle && `TT @${c.tiktokHandle}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted">{c.originChannel ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted">
                  {c.budget !== null ? `$${c.budget.toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {c.shoeSizeUs !== null || c.shoeSizeCm !== null
                    ? `${c.shoeSizeUs ?? "—"} US / ${c.shoeSizeCm ?? "—"} cm`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {c.assignedUser?.name ?? c.assignedUser?.email ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {c.tags.map(({ tag }) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5 text-[11px] text-foreground"
                      >
                        {tag.name}
                        <button
                          type="button"
                          onClick={() => void removeTag(c.id, tag.id)}
                          aria-label={`Remove tag ${tag.name}`}
                          className="text-muted hover:text-error"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagDraft[c.id] ?? ""}
                      onChange={(e) => setTagDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addTag(c.id);
                        }
                      }}
                      placeholder="+ tag"
                      className="w-16 rounded border border-border bg-transparent px-1.5 py-0.5 text-[11px] outline-none focus:border-accent/40"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                  No contacts match these filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p className="px-3 py-4 text-sm text-muted">Loading…</p>}
      </div>

      {contacts.length < total && !loading && (
        <button
          type="button"
          onClick={() => void load(offset + contacts.length)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Load more
        </button>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitForm}
            className="panel max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded p-6"
          >
            <h2 className="mb-4 text-base font-semibold text-foreground">New contact</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Name
                <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
              </label>
              <label className={labelClass}>
                Email
                <input className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
              </label>
              <label className={labelClass}>
                Instagram username
                <input
                  className={inputClass}
                  value={form.instagramUsername}
                  onChange={(e) => set("instagramUsername", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                WhatsApp phone
                <input
                  className={inputClass}
                  value={form.whatsappPhone}
                  onChange={(e) => set("whatsappPhone", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Facebook PSID
                <input
                  className={inputClass}
                  value={form.facebookPsid}
                  onChange={(e) => set("facebookPsid", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                TikTok handle
                <input
                  className={inputClass}
                  value={form.tiktokHandle}
                  onChange={(e) => set("tiktokHandle", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Canal de origen
                <select
                  className={selectClass}
                  value={form.originChannel}
                  onChange={(e) => set("originChannel", e.target.value)}
                >
                  <option value="">—</option>
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Presupuesto
                <input
                  type="number"
                  className={inputClass}
                  value={form.budget}
                  onChange={(e) => set("budget", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Link del pedido
                <input
                  className={inputClass}
                  value={form.orderLink}
                  onChange={(e) => set("orderLink", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Marca de interés
                <input
                  className={inputClass}
                  value={form.brandInterest}
                  onChange={(e) => set("brandInterest", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Talle consultado (US)
                <input
                  type="number"
                  step="0.5"
                  className={inputClass}
                  value={form.shoeSizeUs}
                  onChange={(e) => set("shoeSizeUs", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Talle consultado (cm)
                <input
                  type="number"
                  step="0.5"
                  className={inputClass}
                  value={form.shoeSizeCm}
                  onChange={(e) => set("shoeSizeCm", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                N° orden Tienda Nube
                <input
                  className={inputClass}
                  value={form.tiendaNubeOrderNumber}
                  onChange={(e) => set("tiendaNubeOrderNumber", e.target.value)}
                />
              </label>
              <label className={labelClass}>
                Vendedor asignado
                <select
                  className={selectClass}
                  value={form.assignedUserId}
                  onChange={(e) => set("assignedUserId", e.target.value)}
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name ?? m.user.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Products of interest (comma separated)
                <input
                  className={inputClass}
                  value={form.productsInterest}
                  onChange={(e) => set("productsInterest", e.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Create contact"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
