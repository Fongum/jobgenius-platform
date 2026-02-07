import { supabaseServer } from "@/lib/supabase/server";
import { verifyExtensionSession } from "@/lib/extension-auth";
import { getAmEmailFromHeaders } from "@/lib/am";
import { parseJobPost } from "@/lib/matching";

type SaveJobPayload = {
  title?: string;
  url?: string;
  source?: string;
  company?: string | null;
  location?: string | null;
  raw_html?: string | null;
  raw_text?: string | null;
};

/**
 * POST /api/jobs/save
 *
 * Saves a job to the central Job Bank (job_posts table).
 * Parses structured data from descriptions when available.
 * Triggers auto-matching for all active seekers assigned to the AM.
 */
export async function POST(request: Request) {
  let payload: SaveJobPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.title || !payload?.url) {
    return Response.json(
      { success: false, error: "Missing required fields: title, url." },
      { status: 400 }
    );
  }

  // Try to extract AM ID from Bearer token (extension auth) or legacy header
  let scrapedByAmId: string | null = null;
  let sourceType = "manual";

  // First try Bearer token auth
  const session = await verifyExtensionSession(request);
  if (session) {
    scrapedByAmId = session.account_manager_id;
    sourceType = "extension_scrape";
  } else {
    // Fallback: try legacy x-am-email header
    const amEmail = getAmEmailFromHeaders(request.headers);
    if (amEmail) {
      const { data: am } = await supabaseServer
        .from("account_managers")
        .select("id")
        .eq("email", amEmail)
        .single();
      if (am) {
        scrapedByAmId = am.id;
        sourceType = "extension_scrape";
      }
    }
  }

  const { data: existingPost, error: existingError } = await supabaseServer
    .from("job_posts")
    .select("id")
    .eq("url", payload.url)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { success: false, error: "Failed to check existing job post." },
      { status: 500 }
    );
  }

  let insertedId: string | null = null;

  if (!existingPost) {
    // Parse structured data from description if available
    let parsedData: { [key: string]: unknown } = {};
    if (payload.raw_text) {
      const parsed = parseJobPost(
        payload.title,
        payload.company ?? null,
        payload.location ?? null,
        payload.raw_text
      );
      parsedData = { ...parsed };
    }

    const { data: insertedPost, error: insertError } = await supabaseServer
      .from("job_posts")
      .insert({
        title: payload.title,
        url: payload.url,
        source: payload.source ?? "extension",
        company: payload.company ?? null,
        location: payload.location ?? null,
        description_text: payload.raw_text ?? null,
        scraped_by_am_id: scrapedByAmId,
        source_type: sourceType,
        ...parsedData,
        parsed_at: payload.raw_text ? new Date().toISOString() : null,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      })
      .select("id")
      .single();

    if (insertError) {
      return Response.json(
        { success: false, error: "Failed to save job." },
        { status: 500 }
      );
    }

    insertedId = insertedPost.id;

    // Auto-match: trigger matching for all active seekers assigned to this AM
    if (insertedId && scrapedByAmId) {
      triggerAutoMatch(insertedId, scrapedByAmId).catch((err) =>
        console.error("Auto-match failed:", err)
      );
    }
  } else {
    // Update existing job's last_seen_at
    await supabaseServer
      .from("job_posts")
      .update({
        last_seen_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", existingPost.id);
  }

  const { error: savedJobsError } = await supabaseServer.from("saved_jobs").upsert(
    {
      title: payload.title,
      url: payload.url,
      source: payload.source ?? "extension",
      raw_html: payload.raw_html ?? null,
      raw_text: payload.raw_text ?? null,
    },
    { onConflict: "url" }
  );

  if (savedJobsError) {
    return Response.json(
      { success: false, error: "Failed to save job." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    id: insertedId || existingPost?.id,
    duplicate: Boolean(existingPost),
    needs_attention: false,
  });
}

/**
 * Auto-match a newly saved job against all active seekers assigned to the AM.
 * Runs asynchronously so it doesn't block the save response.
 */
async function triggerAutoMatch(jobPostId: string, amId: string) {
  // Get all active seekers assigned to this AM
  const { data: assignments } = await supabaseServer
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", amId);

  if (!assignments || assignments.length === 0) return;

  const seekerIds = assignments.map((a) => a.job_seeker_id);

  // Get seeker profiles
  const { data: seekers } = await supabaseServer
    .from("job_seekers")
    .select(`
      id, location, seniority, salary_min, salary_max, work_type,
      target_titles, skills, resume_text, match_threshold, match_weights,
      preferred_industries, preferred_company_sizes, exclude_keywords,
      years_experience, preferred_locations, open_to_relocation,
      requires_visa_sponsorship, location_preferences
    `)
    .in("id", seekerIds)
    .eq("status", "active");

  if (!seekers || seekers.length === 0) return;

  // Get the job post data
  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select(`
      id, url, title, company, location, description_text,
      salary_min, salary_max, seniority_level, work_type,
      years_experience_min, years_experience_max,
      required_skills, preferred_skills, industry, company_size,
      offers_visa_sponsorship, employment_type, parsed_at
    `)
    .eq("id", jobPostId)
    .single();

  if (!jobPost) return;

  const { computeMatchScore } = await import("@/lib/matching");

  for (const seekerData of seekers) {
    try {
      const seeker = {
        id: seekerData.id,
        location: seekerData.location,
        seniority: seekerData.seniority,
        salary_min: seekerData.salary_min,
        salary_max: seekerData.salary_max,
        work_type: seekerData.work_type,
        target_titles: seekerData.target_titles ?? [],
        skills: seekerData.skills ?? [],
        resume_text: seekerData.resume_text,
        match_threshold: seekerData.match_threshold,
        preferred_industries: seekerData.preferred_industries ?? [],
        preferred_company_sizes: seekerData.preferred_company_sizes ?? [],
        exclude_keywords: seekerData.exclude_keywords ?? [],
        years_experience: seekerData.years_experience ?? null,
        preferred_locations: seekerData.preferred_locations ?? [],
        open_to_relocation: seekerData.open_to_relocation ?? false,
        requires_visa_sponsorship: seekerData.requires_visa_sponsorship ?? false,
        location_preferences: seekerData.location_preferences ?? [],
      };

      const job = {
        id: jobPost.id,
        url: jobPost.url,
        title: jobPost.title,
        company: jobPost.company,
        location: jobPost.location,
        description_text: jobPost.description_text,
        salary_min: jobPost.salary_min,
        salary_max: jobPost.salary_max,
        seniority_level: jobPost.seniority_level,
        work_type: jobPost.work_type,
        years_experience_min: jobPost.years_experience_min,
        years_experience_max: jobPost.years_experience_max,
        required_skills: jobPost.required_skills ?? [],
        preferred_skills: jobPost.preferred_skills ?? [],
        industry: jobPost.industry,
        company_size: jobPost.company_size,
        offers_visa_sponsorship: jobPost.offers_visa_sponsorship,
        employment_type: jobPost.employment_type,
        parsed_at: jobPost.parsed_at,
      };

      // Use custom weights if the seeker has them
      const customWeights = seekerData.match_weights as Record<string, number> | null;
      const weights = customWeights
        ? {
            skills: customWeights.skills ?? 35,
            title: customWeights.title ?? 20,
            experience: customWeights.experience ?? 10,
            salary: customWeights.salary ?? 10,
            location: customWeights.location ?? 15,
            company_fit: customWeights.company_fit ?? 10,
            max_penalty: customWeights.max_penalty ?? 15,
          }
        : undefined;

      const matchResult = computeMatchScore(seeker, job, weights);

      await supabaseServer.from("job_match_scores").upsert(
        {
          job_post_id: jobPost.id,
          job_seeker_id: seeker.id,
          score: matchResult.score,
          confidence: matchResult.confidence,
          recommendation: matchResult.recommendation,
          reasons: {
            ...matchResult.reasons,
            component_scores: matchResult.component_scores,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_post_id,job_seeker_id" }
      );
    } catch (err) {
      console.error(`Auto-match error for seeker ${seekerData.id}:`, err);
    }
  }
}
