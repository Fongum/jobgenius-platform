import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { parseJobPost } from "@/lib/matching";

/**
 * POST /api/admin/promote-jobs
 *
 * Promote external_jobs to job_posts (the main job bank used for matching).
 * Supports promoting by ID list, source, category, or auto-promoting high-quality jobs.
 */
export async function POST(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ error: amResult.error }, { status: 401 });
  }

  // Require admin role
  const { data: amData } = await supabaseAdmin
    .from("account_managers")
    .select("role")
    .eq("id", amResult.accountManager.id)
    .single();

  if (!amData || !isAdminRole(amData.role)) {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: {
    ids?: string[];
    source?: string;
    category?: string;
    auto?: boolean;
    limit?: number;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Build query for external jobs to promote
  let query = supabaseAdmin
    .from("external_jobs")
    .select("*")
    .is("promoted_to_job_post_id", null)
    .eq("is_stale", false);

  if (body.ids && body.ids.length > 0) {
    query = query.in("id", body.ids);
  } else {
    if (body.source) query = query.eq("source", body.source);
    if (body.category) query = query.eq("category", body.category);
    query = query.limit(body.limit ?? 100);
  }

  const { data: externalJobs, error: fetchError } = await query;

  if (fetchError) {
    return Response.json({ error: fetchError.message }, { status: 500 });
  }

  if (!externalJobs || externalJobs.length === 0) {
    return Response.json({ promoted: 0, message: "No eligible jobs to promote." });
  }

  let promoted = 0;
  let skippedDuplicates = 0;
  const errors: string[] = [];

  for (const ej of externalJobs) {
    try {
      // Check for duplicates by URL
      if (ej.url) {
        const { data: existing } = await supabaseAdmin
          .from("job_posts")
          .select("id")
          .eq("url", ej.url)
          .maybeSingle();

        if (existing) {
          // Link the external job to existing post, update times_seen
          await supabaseAdmin
            .from("external_jobs")
            .update({ promoted_to_job_post_id: existing.id, promoted_at: new Date().toISOString() })
            .eq("id", ej.id);

          await supabaseAdmin
            .from("job_posts")
            .update({
              last_seen_at: new Date().toISOString(),
              times_seen: (await supabaseAdmin.from("job_posts").select("times_seen").eq("id", existing.id).single()).data?.times_seen + 1 || 2,
            })
            .eq("id", existing.id);

          skippedDuplicates++;
          continue;
        }
      }

      // Parse structured data from description if available
      const parsed = ej.description_text
        ? parseJobPost(ej.title, ej.company_name, ej.location, ej.description_text)
        : null;

      // Insert into job_posts
      const { data: newPost, error: insertError } = await supabaseAdmin
        .from("job_posts")
        .insert({
          url: ej.url,
          title: ej.title,
          company: ej.company_name,
          location: ej.location,
          description_text: ej.description_text ?? null,
          external_id: ej.external_id,
          source_name: ej.source,
          source_type: "discovery",
          is_active: true,
          discovered_at: ej.fetched_at,
          first_seen_at: ej.first_seen_at ?? ej.fetched_at,
          last_seen_at: new Date().toISOString(),
          ...(parsed ? {
            salary_min: parsed.salary_min,
            salary_max: parsed.salary_max,
            seniority_level: parsed.seniority_level,
            work_type: parsed.work_type,
            years_experience_min: parsed.years_experience_min,
            years_experience_max: parsed.years_experience_max,
            required_skills: parsed.required_skills,
            preferred_skills: parsed.preferred_skills,
            industry: parsed.industry,
            company_size: parsed.company_size,
            offers_visa_sponsorship: parsed.offers_visa_sponsorship,
            employment_type: parsed.employment_type,
            parsed_at: new Date().toISOString(),
          } : {}),
        })
        .select("id")
        .single();

      if (insertError || !newPost) {
        errors.push(`Failed to insert job "${ej.title}": ${insertError?.message}`);
        continue;
      }

      // Link external job to the new post
      await supabaseAdmin
        .from("external_jobs")
        .update({ promoted_to_job_post_id: newPost.id, promoted_at: new Date().toISOString() })
        .eq("id", ej.id);

      promoted++;
    } catch (err) {
      errors.push(`Error promoting "${ej.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return Response.json({
    promoted,
    skipped_duplicates: skippedDuplicates,
    errors: errors.length > 0 ? errors : undefined,
  });
}
