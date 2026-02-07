import { redirect } from "next/navigation";

export default function AppliedPage() {
  redirect("/dashboard/pipeline?tab=applied");
}
