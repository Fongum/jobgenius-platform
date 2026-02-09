import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/dashboard/global-jobs
 *
 * Paginated list of scraped job posts with match info.
 * Query params: page, limit, source_type, search
 */
export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json(
      { success: false, error: amResult.error },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 100);
  const sourceType = searchParams.get("source_type");
  const search = searchParams.get("search");
  const offset = (page - 1) * limit;

  let query = supabaseServer
    .from("job_posts")
    .select(
      "id, title, company, location, url, source, source_type, scraped_by_am_id, work_type, salary_min, salary_max, seniority_level, parsed_at, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (sourceType) {
    query = query.eq("source_type", sourceType);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,company.ilike.%${search}%`);
  }

  const { data: jobs, error, count } = await query;

  if (error) {
    return Response.json(
      { success: false, error: "Failed to fetch jobs." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    jobs: jobs || [],
    total: count ?? 0,
    page,
    limit,
    total_pages: Math.ceil((count ?? 0) / limit),
  });
}

/**
 * POST /api/dashboard/global-jobs
 *
 * Assign a global job to a seeker — runs matching + optional queue.
 * Body: { job_post_id, job_seeker_id, auto_queue?: boolean }
 */
export async function POST(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json(
      { success: false, error: amResult.error },
      { status: 401 }
    );
  }

  let body: { job_post_id?: string; job_seeker_id?: string; auto_queue?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!body.job_post_id || !body.job_seeker_id) {
    return Response.json(
      { success: false, error: "job_post_id and job_seeker_id are required." },
      { status: 400 }
    );
  }

  // Trigger match run for this specific pair
  const matchResponse = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/match/run`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("authorization")
          ? { Authorization: request.headers.get("authorization") as string }
          : {}),
      },
      body: JSON.stringify({
        job_seeker_id: body.job_seeker_id,
        job_post_id: body.job_post_id,
      }),
    }
  );

  const matchResult = await matchResponse.json();

  // If auto_queue, add to application queue
  if (body.auto_queue) {
    await supabaseServer.from("application_queue").upsert(
      {
        job_post_id: body.job_post_id,
        job_seeker_id: body.job_seeker_id,
        status: "QUEUED",
        category: "global_assign",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_post_id,job_seeker_id" }
    );
  }

  return Response.json({
    success: true,
    match: matchResult,
    queued: body.auto_queue ?? false,
  });
}
