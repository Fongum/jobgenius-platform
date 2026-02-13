import { getAccountManagerFromRequest, hasJobSeekerAccess } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const seekerId = url.searchParams.get("job_seeker_id");

  let query = supabaseServer
    .from("learning_tracks")
    .select(`
      *,
      job_seekers ( id, full_name, email ),
      job_posts ( id, title, company ),
      learning_lessons ( id )
    `)
    .eq("account_manager_id", amResult.accountManager.id)
    .order("updated_at", { ascending: false });

  if (seekerId) {
    query = query.eq("job_seeker_id", seekerId);
  }

  const { data: tracks, error } = await query;

  if (error) {
    return Response.json({ success: false, error: "Failed to fetch tracks." }, { status: 500 });
  }

  return Response.json({ success: true, items: tracks ?? [] });
}

export async function POST(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  let body: {
    job_seeker_id?: string;
    title?: string;
    description?: string;
    category?: string;
    job_post_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.job_seeker_id || !body.title) {
    return Response.json(
      { success: false, error: "Missing required fields: job_seeker_id, title." },
      { status: 400 }
    );
  }

  const hasAccess = await hasJobSeekerAccess(amResult.accountManager.id, body.job_seeker_id);
  if (!hasAccess) {
    return Response.json(
      { success: false, error: "Not authorized for this job seeker." },
      { status: 403 }
    );
  }

  const validCategories = ["technical", "behavioral", "industry", "tools", "general"];
  const category = validCategories.includes(body.category ?? "") ? body.category : "general";

  const { data: track, error } = await supabaseServer
    .from("learning_tracks")
    .insert({
      job_seeker_id: body.job_seeker_id,
      account_manager_id: amResult.accountManager.id,
      title: body.title,
      description: body.description ?? null,
      category,
      job_post_id: body.job_post_id ?? null,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ success: false, error: "Failed to create track." }, { status: 500 });
  }

  return Response.json({ success: true, track }, { status: 201 });
}
