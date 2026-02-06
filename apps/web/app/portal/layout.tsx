import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PortalShell from "./portal-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "job_seeker") {
    redirect("/dashboard");
  }

  return (
    <PortalShell userName={user.name || user.email}>
      {children}
    </PortalShell>
  );
}
