import { requireJobSeeker } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import TrackerClient from "./TrackerClient";

export default async function TrackerPage() {
  const auth = await requireJobSeeker(headers());
  if ("error" in auth) redirect("/login");

  return <TrackerClient />;
}
