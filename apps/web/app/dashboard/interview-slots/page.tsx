import { getAmEmailFromHeaders } from "@/lib/am";
import { supabaseServer } from "@/lib/supabase/server";
import SlotsClient from "./SlotsClient";

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
  const amEmail = getAmEmailFromHeaders();

  if (!amEmail) {
    return (
      <main>
        <h1>Interview Slots</h1>
        <p>Missing AM email. Set x-am-email header or AM_EMAIL env var.</p>
      </main>
    );
  }

  const { data: accountManager, error: amError } = await supabaseServer
    .from("account_managers")
    .select("id")
    .eq("email", amEmail)
    .single();

  if (amError || !accountManager) {
    return (
      <main>
        <h1>Interview Slots</h1>
        <p>Account manager not found for {amEmail}.</p>
      </main>
    );
  }

  const { data: slots, error } = await supabaseServer
    .from("interview_slots")
    .select("id, account_manager_id, job_post_id, start_at, end_at, duration_min, is_booked, created_at")
    .eq("account_manager_id", accountManager.id)
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
      <p>Account Manager: {amEmail}</p>
      <SlotsClient
        slots={(slots ?? []) as SlotRow[]}
        accountManagerId={accountManager.id}
        amEmail={amEmail}
      />
    </main>
  );
}
