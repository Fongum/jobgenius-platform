import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

type GeneratePayload = {
  run_id?: string;
};

function buildPlan(args: {
  runId: string;
  jobSeekerId: string;
  ats: string | null;
  targetUrl: string | null;
}) {
  return {
    version: 1,
    metadata: {
      ats: args.ats,
      targetUrl: args.targetUrl,
      runId: args.runId,
      jobSeekerId: args.jobSeekerId,
      createdAt: new Date().toISOString(),
    },
    steps: [
      { name: "OPEN_URL" },
      { name: "DETECT_ATS" },
      { name: "TRY_APPLY_ENTRY" },
      { name: "EXTRACT_FIELDS" },
      { name: "FILL_KNOWN" },
      { name: "CHECK_REQUIRED" },
      { name: "TRY_SUBMIT" },
      { name: "CONFIRM" },
    ],
  };
}

function requiresClaimToken(headers: Headers) {
  const runner = (headers.get("x-runner") ?? "").toLowerCase();
  return runner === "extension" || runner === "cloud";
}

export async function POST(request: Request) {
  let payload: GeneratePayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.run_id) {
    return Response.json(
      { success: false, error: "Missing run_id." },
      { status: 400 }
    );
  }

  const { data: run, error: runError } = await supabaseServer
    .from("application_runs")
    .select("id, job_seeker_id, job_post_id, ats_type, claim_token")
    .eq("id", payload.run_id)
    .single();

  if (runError || !run) {
    return Response.json(
      { success: false, error: "Run not found." },
      { status: 404 }
    );
  }

  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const hasAccess = await hasJobSeekerAccess(
    amResult.accountManager.id,
    run.job_seeker_id
  );

  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  if (requiresClaimToken(request.headers)) {
    const claimToken = request.headers.get("x-claim-token") ?? "";
    if (!claimToken) {
      return Response.json(
        { success: false, error: "Missing claim_token." },
        { status: 400 }
      );
    }
    if (!run.claim_token || run.claim_token !== claimToken) {
      return Response.json(
        { success: false, error: "Claim token mismatch." },
        { status: 409 }
      );
    }
  }

  const { data: existing } = await supabaseServer
    .from("apply_plans")
    .select("plan, version, created_at")
    .eq("run_id", run.id)
    .maybeSingle();

  if (existing) {
    return Response.json({ success: true, plan: existing.plan, version: existing.version });
  }

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("url")
    .eq("id", run.job_post_id)
    .maybeSingle();

  const plan = buildPlan({
    runId: run.id,
    jobSeekerId: run.job_seeker_id,
    ats: run.ats_type,
    targetUrl: jobPost?.url ?? null,
  });

  const { error: insertError } = await supabaseServer.from("apply_plans").insert({
    run_id: run.id,
    plan,
    version: plan.version,
  });

  if (insertError) {
    return Response.json(
      { success: false, error: "Failed to store plan." },
      { status: 500 }
    );
  }

  return Response.json({ success: true, plan, version: plan.version });
}
