import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import IncentiveSettingsClient from "./IncentiveSettingsClient";

// Readable by any AM — the formula behind someone's pay should not be a
// secret. The save controls are hidden unless the API says can_edit.
export default async function IncentivesPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  return <IncentiveSettingsClient />;
}
