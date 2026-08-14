import { NextResponse } from "next/server";
import { enforceOpsRateLimit } from "@/lib/rate-limit-presets";
import { sweepInterviewMilestones } from "@/lib/interview-milestones";

const OPS_API_KEY = process.env.OPS_API_KEY;

/**
 * POST /api/ops/interview-milestones — daily cron (scheduled-jobs.yml).
 *
 * Awards the first-interview milestone to any client who has reached an
 * interview and has not been paid for one. Idempotent through the partial
 * unique index, so a re-run cannot double-pay.
 */
export async function POST(request: Request) {
  const rl = await enforceOpsRateLimit(request);
  if (!rl.allowed) return rl.response;

  const key = request.headers.get("x-ops-key") ?? "";
  if (!OPS_API_KEY || key !== OPS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepInterviewMilestones();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[ops:interview-milestones]", error);
    return NextResponse.json(
      { error: "Failed to sweep interview milestones." },
      { status: 500 }
    );
  }
}
