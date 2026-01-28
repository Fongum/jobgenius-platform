import { supabaseServer } from "@/lib/supabase/server";

type OtpPayload = {
  job_seeker_id?: string;
  channel?: "EMAIL" | "SMS";
  code?: string;
};

export async function POST(request: Request) {
  let payload: OtpPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id || !payload?.channel || !payload?.code) {
    return Response.json(
      {
        success: false,
        error: "Missing required fields: job_seeker_id, channel, code.",
      },
      { status: 400 }
    );
  }

  if (!["EMAIL", "SMS"].includes(payload.channel)) {
    return Response.json(
      { success: false, error: "Invalid channel." },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer.from("otp_inbox").insert({
    job_seeker_id: payload.job_seeker_id,
    channel: payload.channel,
    code: payload.code,
  });

  if (error) {
    return Response.json(
      { success: false, error: "Failed to store OTP." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
