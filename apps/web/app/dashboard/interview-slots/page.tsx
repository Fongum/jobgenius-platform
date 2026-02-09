import { getCurrentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import SlotsClient from "./SlotsClient";
import { redirect } from "next/navigation";

type SlotRow = {
  id: string;
  account_manager_id: string;
  job_post_id: string | null;
  start_at: string;
  end_at: string;
  duration_min: number;
  is_booked: boolean;
  created_at: string;
};

export default async function InterviewSlotsPage() {
  const user = await getCurrentUser();
  if (!user || user.userType !== "am") {
    redirect("/login");
  }

  const { data: slots, error } = await supabaseServer
    .from("interview_slots")
    .select("id, account_manager_id, job_post_id, start_at, end_at, duration_min, is_booked, created_at")
    .eq("account_manager_id", user.id)
    .order("start_at", { ascending: true });

  if (error) {
    return (
      <main>
        <h1>Interview Slots</h1>
        <p>Failed to load slots.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Interview Slots</h1>
      <p>Account Manager: {user.email}</p>
      <SlotsClient
        slots={(slots ?? []) as SlotRow[]}
        accountManagerId={user.id}
      />
    </main>
  );
}
