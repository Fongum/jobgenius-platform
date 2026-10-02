// Shared bits for the recruiter directory pages.

export const STAGE_BADGE: Record<string, string> = {
  NEW: "bg-gray-100 text-gray-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  ENGAGED: "bg-violet-100 text-violet-700",
  INTERVIEWING: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-500",
};

export const REQUEST_STATUS_BADGE: Record<string, string> = {
  new: "bg-amber-100 text-amber-800",
  reviewing: "bg-blue-100 text-blue-700",
  qualified: "bg-violet-100 text-violet-700",
  awaiting_details: "bg-amber-100 text-amber-800",
  candidate_shortlist_sent: "bg-teal-100 text-teal-700",
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
  rejected: "bg-gray-100 text-gray-500",
};

export function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-gray-400">—</span>;
  return <Badge className={STAGE_BADGE[stage] ?? "bg-gray-100 text-gray-600"}>{stage.toLowerCase()}</Badge>;
}

export function DoNotContactBadge() {
  return <Badge className="bg-red-100 text-red-700">do not contact</Badge>;
}

export function humanize(value: string | null | undefined): string {
  return (value ?? "").replace(/_/g, " ");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
