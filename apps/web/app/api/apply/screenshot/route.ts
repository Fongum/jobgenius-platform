import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";

// A full-page proof screenshot is well under this; the cap only stops abuse.
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  // Authenticate BEFORE reading the body. This used to accept any request that
  // merely carried an Authorization or x-runner header (present, not validated),
  // so anyone could upload files to the runner-screenshots bucket for any run.
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as Blob | null;
  const runId = formData.get("run_id") as string | null;
  const step = formData.get("step") as string | null;
  const reason = formData.get("reason") as string | null;
  const url = formData.get("url") as string | null;

  if (!file || !runId) {
    return NextResponse.json(
      { error: "file and run_id are required" },
      { status: 400 },
    );
  }

  if (file.size > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json({ error: "Screenshot too large." }, { status: 413 });
  }

  // The run must exist and the caller must have access to its seeker. Looking the
  // run up by id also means run_id can no longer be an arbitrary string in the
  // storage path below.
  const { data: run } = await supabaseAdmin
    .from("application_runs")
    .select("id, job_seeker_id")
    .eq("id", runId)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  if (!(await hasJobSeekerAccess(amResult.accountManager.id, run.job_seeker_id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const timestamp = Date.now();
  const screenshotPath = `${runId}/${timestamp}.png`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("runner-screenshots")
    .upload(screenshotPath, buffer, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message },
      { status: 500 },
    );
  }

  const { error: insertError } = await supabaseAdmin
    .from("apply_run_screenshots")
    .insert({
      run_id: runId,
      step: step ?? null,
      reason: reason ?? null,
      url: url ?? null,
      screenshot_path: screenshotPath,
    });

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, path: screenshotPath });
}
