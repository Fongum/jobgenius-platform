import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import EarningsClient from "./EarningsClient";

export default async function EarningsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  return <EarningsClient />;
}
