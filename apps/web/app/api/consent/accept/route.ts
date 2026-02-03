import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type ConsentPayload = {
  job_seeker_id?: string;
  jobseeker_id?: string;
  consent_type?: string;
  version?: string;
  text_hash?: string;
};

export async function POST(request: Request) {
  let payload: ConsentPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const jobSeekerId = payload?.job_seeker_id ?? payload?.jobseeker_id;

  if (!jobSeekerId || !payload.consent_type || !payload.version || !payload.text_hash) {
    return Response.json(
      { success: false, error: "Missing consent fields." },
      { status: 400 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    jobSeekerId
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const { data: existing } = await supabaseServer
    .from("jobseeker_consents")
    .select("id")
    .eq("jobseeker_id", jobSeekerId)
    .eq("consent_type", payload.consent_type)
    .eq("version", payload.version)
    .maybeSingle();

  if (existing?.id) {
    return Response.json({ success: true, already_recorded: true });
  }

  const { error } = await supabaseServer.from("jobseeker_consents").insert({
    jobseeker_id: jobSeekerId,
    consent_type: payload.consent_type,
    accepted_at: new Date().toISOString(),
    version: payload.version,
    text_hash: payload.text_hash,
  });

  if (error) {
    return Response.json(
      { success: false, error: "Failed to record consent." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
