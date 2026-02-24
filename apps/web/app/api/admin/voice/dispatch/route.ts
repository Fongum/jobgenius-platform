import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

type DispatchPayload = {
  call_type?: string;
  limit?: number;
  window_hours?: number;
  targets?: Array<{
    job_seeker_id?: string;
    lead_submission_id?: string;
    phone_number?: string;
    full_name?: string;
    account_manager_id?: string;
    call_type?: string;
  }>;
};

function getOpsDispatchUrl(request: Request) {
  return new URL("/api/ops/voice/dispatch", request.url);
}

function getOpsKey() {
  return process.env.OPS_API_KEY?.trim() || "";
}

async function forwardToOps(
  request: Request,
  method: "GET" | "POST",
  payload?: DispatchPayload
) {
  const opsKey = getOpsKey();
  if (!opsKey) {
    return NextResponse.json(
      { success: false, error: "OPS_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const opsUrl = getOpsDispatchUrl(request);
  if (method === "GET") {
    const requestUrl = new URL(request.url);
    const callType = requestUrl.searchParams.get("call_type");
    const limit = requestUrl.searchParams.get("limit");
    const windowHours = requestUrl.searchParams.get("window_hours");
    if (callType) opsUrl.searchParams.set("call_type", callType);
    if (limit) opsUrl.searchParams.set("limit", limit);
    if (windowHours) opsUrl.searchParams.set("window_hours", windowHours);
  }

  const response = await fetch(opsUrl.toString(), {
    method,
    headers: {
      "x-ops-key": opsKey,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(payload ?? {}) : undefined,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: DispatchPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  return forwardToOps(request, "POST", payload);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return forwardToOps(request, "GET");
}

