import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseAdmin } from "@/lib/auth";

/**
 * GET /api/am/career-pages
 * List monitored company career pages
 */
export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ error: amResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") !== "false";

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin
    .from("company_career_pages")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error, count } = await query;

  if (error) {
    return Response.json({ error: "Failed to load career pages." }, { status: 500 });
  }

  return Response.json({
    career_pages: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    },
  });
}

/**
 * POST /api/am/career-pages
 * Add a new company career page to monitor
 */
export async function POST(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ error: amResult.error }, { status: 401 });
  }

  let body: {
    company_name?: string;
    career_url?: string;
    ats_type?: string;
    board_token?: string;
    check_frequency?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.company_name || !body.career_url) {
    return Response.json(
      { error: "company_name and career_url are required." },
      { status: 400 }
    );
  }

  // Auto-detect ATS type from URL
  let atsType = body.ats_type ?? "unknown";
  let boardToken = body.board_token ?? null;
  const url = body.career_url.toLowerCase();

  if (url.includes("greenhouse.io") || url.includes("boards-api.greenhouse.io")) {
    atsType = "greenhouse";
    // Extract board token: boards.greenhouse.io/{token}/jobs
    const ghMatch = url.match(/greenhouse\.io\/(?:embed\/)?(?:boards\/)?([a-z0-9_-]+)/i);
    if (ghMatch) boardToken = ghMatch[1];
  } else if (url.includes("lever.co")) {
    atsType = "lever";
    const leverMatch = url.match(/lever\.co\/([a-z0-9_-]+)/i);
    if (leverMatch) boardToken = leverMatch[1];
  } else if (url.includes("ashbyhq.com")) {
    atsType = "ashby";
    const ashbyMatch = url.match(/ashbyhq\.com\/([a-z0-9_-]+)/i);
    if (ashbyMatch) boardToken = ashbyMatch[1];
  } else if (url.includes("workday.com") || url.includes("myworkday")) {
    atsType = "workday";
  } else if (url.includes("icims.com")) {
    atsType = "icims";
  }

  const { data, error } = await supabaseAdmin
    .from("company_career_pages")
    .insert({
      company_name: body.company_name,
      career_url: body.career_url,
      ats_type: atsType,
      board_token: boardToken,
      check_frequency: body.check_frequency ?? "daily",
      added_by: amResult.accountManager.id,
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to add career page." }, { status: 500 });
  }

  return Response.json({ career_page: data });
}

/**
 * PATCH /api/am/career-pages
 * Update a career page (toggle active, change frequency)
 */
export async function PATCH(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ error: amResult.error }, { status: 401 });
  }

  let body: { id?: string; is_active?: boolean; check_frequency?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.id) {
    return Response.json({ error: "id is required." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.check_frequency) updates.check_frequency = body.check_frequency;

  const { data, error } = await supabaseAdmin
    .from("company_career_pages")
    .update(updates)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Failed to update career page." }, { status: 500 });
  }

  return Response.json({ career_page: data });
}
