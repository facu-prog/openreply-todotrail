"use client";

/**
 * Shared Kanban + list view for a CRM pipeline (Ventas or Postventa).
 * Moving a ticket between stages is a select dropdown on each card rather
 * than drag-and-drop — same end result, far less UI code for this pass.
 */

import { useCallback, useEffect, useState } from "react";

type Member = { id: string; user: { id: string; name: string | null; email: string | null } };
type ComplaintType = { id: string; name: string; isActive: boolean };
type Ticket = {
  id: string;
  title: string | null;
  stageId: string;
  contact: { id: string; name: string | null; instagramUsername: string | null; whatsappPhone: string | null } | null;
  assignedUser: { id: string; name: string | null; email: string | null } | null;
  complaintType: { id: string; name: string } | null;
  updatedAt: string;
};
type Stage = { id: string; name: string; order: number; isWon: boolean; isLost: boolean; tickets: Ticket[] };
type Pipeline = { id: string; key: string; name: string; stages: Stage[] };

const inputClass =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent/40";

export function PipelineBoard({ pipelineKey, showComplaintType }: { pipelineKey: string; showComplaintType?: boolean }) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [members, setMembers] = useState<Member[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showComplaintManager, setShowComplaintManager] = useState(false);
  const [newComplaintName, setNewComplaintName] = useState("");
  const [newTicket, setNewTicket] = useState({ title: "", assignedUserId: "", complaintTypeId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/pipelines/${pipelineKey}`);
    const data = await res.json();
    if (data.success) setPipeline(data.data);
    setLoading(false);
  }, [pipelineKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((d) => d.success && setMembers(d.data.members))
      .catch(() => {});
    if (showComplaintType) {
      fetch("/api/crm/complaint-types")
        .then((r) => r.json())
        .then((d) => d.success && setComplaintTypes(d.data))
        .catch(() => {});
    }
  }, [showComplaintType]);

  async function moveStage(ticketId: string, stageId: string) {
    await fetch(`/api/crm/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    void load();
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/crm/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pipelineKey,
        title: newTicket.title || undefined,
        assignedUserId: newTicket.assignedUserId || undefined,
        complaintTypeId: newTicket.complaintTypeId || undefined,
      }),
    });
    setShowNewTicket(false);
    setNewTicket({ title: "", assignedUserId: "", complaintTypeId: "" });
    void load();
  }

  async function addComplaintType() {
    const name = newComplaintName.trim();
    if (!name) return;
    await fetch("/api/crm/complaint-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setNewComplaintName("");
    const res = await fetch("/api/crm/complaint-types");
    const data = await res.json();
    if (data.success) setComplaintTypes(data.data);
  }

  async function toggleComplaintType(id: string, isActive: boolean) {
    await fetch("/api/crm/complaint-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    const res = await fetch("/api/crm/complaint-types");
    const data = await res.json();
    if (data.success) setComplaintTypes(data.data);
  }

  if (loading || !pipeline) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const allTickets = pipeline.stages.flatMap((s) => s.tickets.map((t) => ({ ...t, stageName: s.name })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">{pipeline.name}</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView("board")}
              className={`rounded px-3 py-1 ${view === "board" ? "bg-accent text-white" : "text-muted"}`}
            >
              Board
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded px-3 py-1 ${view === "list" ? "bg-accent text-white" : "text-muted"}`}
            >
              List
            </button>
          </div>
          {showComplaintType && (
            <button
              type="button"
              onClick={() => setShowComplaintManager(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Manage complaint types
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNewTicket(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            New ticket
          </button>
        </div>
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pipeline.stages.map((stage) => (
            <div key={stage.id} className="panel flex flex-col gap-2 rounded p-3">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{stage.name}</span>
                <span>{stage.tickets.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {stage.tickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    stages={pipeline.stages}
                    showComplaintType={showComplaintType}
                    onMove={(stageId) => void moveStage(ticket.id, stageId)}
                  />
                ))}
                {stage.tickets.length === 0 && (
                  <p className="rounded border border-dashed border-border p-3 text-center text-xs text-muted">
                    No tickets
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel overflow-x-auto rounded">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Assigned</th>
                {showComplaintType && <th className="px-3 py-2">Tipo de reclamo</th>}
              </tr>
            </thead>
            <tbody>
              {allTickets.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">{t.title ?? "Untitled"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={t.stageId}
                      onChange={(e) => void moveStage(t.id, e.target.value)}
                      className={inputClass}
                    >
                      {pipeline.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-muted">{t.contact?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{t.assignedUser?.name ?? t.assignedUser?.email ?? "—"}</td>
                  {showComplaintType && (
                    <td className="px-3 py-2 text-muted">{t.complaintType?.name ?? "—"}</td>
                  )}
                </tr>
              ))}
              {allTickets.length === 0 && (
                <tr>
                  <td colSpan={showComplaintType ? 5 : 4} className="px-3 py-8 text-center text-muted">
                    No tickets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={createTicket} className="panel w-full max-w-md rounded p-6">
            <h2 className="mb-4 text-base font-semibold text-foreground">New ticket</h2>
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Title
                <input
                  className={inputClass}
                  value={newTicket.title}
                  onChange={(e) => setNewTicket((p) => ({ ...p, title: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Assigned to
                <select
                  className={inputClass}
                  value={newTicket.assignedUserId}
                  onChange={(e) => setNewTicket((p) => ({ ...p, assignedUserId: e.target.value }))}
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name ?? m.user.email}
                    </option>
                  ))}
                </select>
              </label>
              {showComplaintType && (
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Tipo de reclamo
                  <select
                    className={inputClass}
                    value={newTicket.complaintTypeId}
                    onChange={(e) => setNewTicket((p) => ({ ...p, complaintTypeId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {complaintTypes
                      .filter((c) => c.isActive)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewTicket(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {showComplaintManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="panel w-full max-w-md rounded p-6">
            <h2 className="mb-4 text-base font-semibold text-foreground">Complaint types</h2>
            <div className="space-y-2">
              {complaintTypes.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={c.isActive ? "text-foreground" : "text-muted line-through"}>{c.name}</span>
                  <button
                    type="button"
                    onClick={() => void toggleComplaintType(c.id, !c.isActive)}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    {c.isActive ? "Disable" : "Enable"}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input
                className={`${inputClass} flex-1`}
                placeholder="New complaint type"
                value={newComplaintName}
                onChange={(e) => setNewComplaintName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addComplaintType()}
              />
              <button
                type="button"
                onClick={() => void addComplaintType()}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
              >
                Add
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowComplaintManager(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  stages,
  showComplaintType,
  onMove,
}: {
  ticket: Ticket;
  stages: Stage[];
  showComplaintType?: boolean;
  onMove: (stageId: string) => void;
}) {
  return (
    <div className="rounded border border-border bg-surface p-3 text-sm">
      <p className="font-medium text-foreground">{ticket.title ?? ticket.contact?.name ?? "Untitled"}</p>
      {ticket.contact && <p className="text-xs text-muted">{ticket.contact.name}</p>}
      {showComplaintType && ticket.complaintType && (
        <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
          {ticket.complaintType.name}
        </span>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{ticket.assignedUser?.name ?? "Unassigned"}</span>
        <select
          value={ticket.stageId}
          onChange={(e) => onMove(e.target.value)}
          className="rounded border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus:border-accent/40"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
