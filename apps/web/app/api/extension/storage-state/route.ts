import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

type StorageStatePayload = {
  job_seeker_id?: string;
  storage_state?: Record<string, unknown> | null;
};

const BUCKET_ID = "runner_state";

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === BUCKET_ID);
  if (!exists) {
    await supabaseAdmin.storage.createBucket(BUCKET_ID, { public: false });
  }
}

export async function POST(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
    }

    let payload: StorageStatePayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const jobSeekerId = payload.job_seeker_id ?? session.active_job_seeker_id;
    if (!jobSeekerId) {
      return NextResponse.json(
        { error: "job_seeker_id is required." },
        { status: 400 }
      );
    }

    if (!payload.storage_state || typeof payload.storage_state !== "object") {
      return NextResponse.json(
        { error: "storage_state must be an object." },
        { status: 400 }
      );
    }

    const { data: assignment } = await supabaseAdmin
      .from("job_seeker_assignments")
      .select("id")
      .eq("account_manager_id", session.account_manager_id)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Job seeker is not assigned to you." },
        { status: 403 }
      );
    }

    await ensureBucket();

    const storagePath = `${jobSeekerId}/storage-state.json`;
    const body = Buffer.from(JSON.stringify(payload.storage_state));
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_ID)
      .upload(storagePath, body, {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Failed to upload storage state: ${uploadError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, path: storagePath });
  } catch (error) {
    console.error("Extension storage state error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
