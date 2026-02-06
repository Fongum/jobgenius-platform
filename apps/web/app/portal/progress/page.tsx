import { getCurrentUser } from "@/lib/auth";
import ProgressClient from "./ProgressClient";

export default async function ProgressPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Progress data is fetched client-side so it's always fresh
  return <ProgressClient />;
}
