import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DashboardShell from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "am") {
    redirect("/portal");
  }

  // Redirect pending AMs to approval waiting page
  if (user.status === "pending") {
    redirect("/pending-approval");
  }

  // Redirect rejected AMs to rejected page
  if (user.status === "rejected") {
    redirect("/account-rejected");
  }

  return (
    <DashboardShell
      userName={user.name || user.email}
      userRole={user.role || "am"}
    >
      {children}
    </DashboardShell>
  );
}
