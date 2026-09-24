// respondetuti.todotrail.com.ar and crm.todotrail.com.ar are the same
// deployment and share the same login/workspaces (see proxy.ts). The only
// difference is which nav sections are visible, so each domain feels like
// its own product. Any other host (the Railway domain, localhost in dev)
// falls back to "all" so nothing is hidden there.
export type SiteMode = "respondetuti" | "crm" | "all";

export function resolveSiteMode(host: string | null): SiteMode {
  if (!host) return "all";
  if (host.startsWith("crm.")) return "crm";
  if (host.startsWith("respondetuti.")) return "respondetuti";
  return "all";
}
