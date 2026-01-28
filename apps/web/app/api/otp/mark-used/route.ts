import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type MarkUsedPayload = {
  otp_id?: string;
};

export async function POST(request: Request) {
  let payload: MarkUsedPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.otp_id) {
    return Response.json(
      { success: false, error: "Missing otp_id." },
      { status: 400 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { data: otpRow, error: otpError } = await supabaseServer
    .from("otp_inbox")
    .select("id, job_seeker_id")
    .eq("id", payload.otp_id)
    .single();

  if (otpError || !otpRow) {
    return Response.json(
      { success: false, error: "OTP record not found." },
      { status: 404 }
    );
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    otpRow.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const { error } = await supabaseServer
    .from("otp_inbox")
    .update({ used_at: new Date().toISOString() })
    .eq("id", payload.otp_id);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to mark OTP used." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
