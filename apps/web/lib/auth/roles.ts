export function normalizeAMRole(role: string | null | undefined): string {
  const compact = String(role ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

  if (compact === "superadmin") return "superadmin";
  if (compact === "admin") return "admin";
  if (compact === "am" || compact === "accountmanager") return "am";

  return String(role ?? "am").toLowerCase().trim();
}

export function isAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeAMRole(role);
  return normalized === "admin" || normalized === "superadmin";
}
