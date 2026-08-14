import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ClientDifficultyClient from "./ClientDifficultyClient";

export default async function ClientDifficultyPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  return <ClientDifficultyClient />;
}
