import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import AvailabilityClient from "./AvailabilityClient";

function getISOMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const seekerId = user.id;
  const weekStart = getISOMonday(new Date());

  const [{ data: slots }, { data: confirmation }] = await Promise.all([
    supabaseAdmin
      .from("job_seeker_availability")
      .select("id, day_of_week, start_time, end_time, timezone, is_active")
      .eq("job_seeker_id", seekerId)
      .order("day_of_week")
      .order("start_time"),
    supabaseAdmin
      .from("job_seeker_availability_confirmations")
      .select("confirmed_at")
      .eq("job_seeker_id", seekerId)
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);

  return (
    <AvailabilityClient
      initialSlots={slots ?? []}
      weekStart={weekStart}
      confirmedThisWeek={!!confirmation}
      confirmedAt={confirmation?.confirmed_at ?? null}
    />
  );
}
