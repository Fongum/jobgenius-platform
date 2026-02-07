import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { parseJobPost, computeMatchScore } from "@/lib/matching";

type DiscoveredJob = {
  external_id: string | null;
  source_name: string;
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  posted_at: string | null;
  description_text: string | null;
  description_html: string | null;
};

type SaveJobsPayload = {
  run_id: string | null;
  jobs: DiscoveredJob[];
};

/**
 * POST /api/discovery/jobs/save
 *
 * Saves discovered jobs to the database.
 * Handles deduplication by external_id and URL.
 */
export async function POST(request: Request) {
  const authResult = requireOpsAuth(request.headers);
  if (!authResult.ok) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let payload: SaveJobsPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload.jobs || !Array.isArray(payload.jobs)) {
    return Response.json(
      { success: false, error: "Missing or invalid jobs array." },
      { status: 400 }
    );
  }

  let saved = 0;
  let duplicates = 0;
  let errors = 0;

  for (const job of payload.jobs) {
    // Skip jobs without URL or title
    if (!job.url || !job.title) {
      errors++;
      continue;
    }

    try {
      // Check for existing job by URL or external_id
      let existingQuery = supabaseServer
        .from("job_posts")
        .select("id")
        .eq("url", job.url);

      const { data: existingByUrl } = await existingQuery.maybeSingle();

      if (existingByUrl) {
        // Update last_seen_at for existing job
        await supabaseServer
          .from("job_posts")
          .update({
            last_seen_at: new Date().toISOString(),
            is_active: true,
          })
          .eq("id", existingByUrl.id);
        duplicates++;
        continue;
      }

      // Check by external_id if available
      if (job.external_id) {
        const { data: existingByExtId } = await supabaseServer
          .from("job_posts")
          .select("id")
          .eq("external_id", job.external_id)
          .eq("source_name", job.source_name)
          .maybeSingle();

        if (existingByExtId) {
          await supabaseServer
            .from("job_posts")
            .update({
              last_seen_at: new Date().toISOString(),
              is_active: true,
            })
            .eq("id", existingByExtId.id);
          duplicates++;
          continue;
        }
      }

      // Parse structured data from description if available
      let parsedData = {};
      if (job.description_text) {
        parsedData = parseJobPost(
          job.title,
          job.company,
          job.location,
          job.description_text
        );
      }

      // Insert new job
      const { error: insertError } = await supabaseServer.from("job_posts").insert({
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        description_text: job.description_text,
        external_id: job.external_id,
        source_name: job.source_name,
        source: job.source_name, // Also set the legacy source field
        discovery_run_id: payload.run_id,
        discovered_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_active: true,
        // Parsed structured data
        ...parsedData,
        parsed_at: job.description_text ? new Date().toISOString() : null,
      });

      if (insertError) {
        // Check if it's a unique constraint violation (race condition)
        if (insertError.code === "23505") {
          duplicates++;
        } else {
          errors++;
        }
      } else {
        saved++;
      }
    } catch (e) {
      errors++;
    }
  }

  // Auto-match newly saved jobs against all active seekers
  if (saved > 0) {
    triggerBulkAutoMatch().catch((err) =>
      console.error("Discovery auto-match failed:", err)
    );
  }

  return Response.json({
    success: true,
    saved,
    duplicates,
    errors,
    total: payload.jobs.length,
  });
}

/**
 * After discovery saves new jobs, auto-match all unscored jobs against active seekers.
 */
async function triggerBulkAutoMatch() {
  // Get all active seekers
  const { data: seekers } = await supabaseServer
    .from("job_seekers")
    .select(`
      id, location, seniority, salary_min, salary_max, work_type,
      target_titles, skills, resume_text, match_threshold, match_weights,
      preferred_industries, preferred_company_sizes, exclude_keywords,
      years_experience, preferred_locations, open_to_relocation,
      requires_visa_sponsorship, location_preferences
    `)
    .eq("status", "active");

  if (!seekers || seekers.length === 0) return;

  // Get recently added jobs (last 24 hours) that might not be scored yet
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentJobs } = await supabaseServer
    .from("job_posts")
    .select(`
      id, url, title, company, location, description_text,
      salary_min, salary_max, seniority_level, work_type,
      years_experience_min, years_experience_max,
      required_skills, preferred_skills, industry, company_size,
      offers_visa_sponsorship, employment_type, parsed_at
    `)
    .gte("created_at", oneDayAgo)
    .eq("is_active", true)
    .limit(200);

  if (!recentJobs || recentJobs.length === 0) return;

  for (const seekerData of seekers) {
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

    for (const jobPost of recentJobs) {
      try {
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
        console.error(`Discovery auto-match error for seeker ${seekerData.id}, job ${jobPost.id}:`, err);
      }
    }
  }
}
