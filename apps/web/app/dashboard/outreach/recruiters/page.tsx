import { redirect } from "next/navigation";

// Replaced by the unified directory at /dashboard/recruiters, which lists
// each recruiter once (this page listed one row per thread) and joins in
// hiring-partner requests. Kept as a redirect for bookmarks.
export default function LegacyOutreachRecruitersPage() {
  redirect("/dashboard/recruiters?filter=mine");
}
