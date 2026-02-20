import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";
import { parseJobPost } from "@/lib/matching";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { normalizeJobUrl } from "@/lib/job-url";

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
  const insertedJobIds: string[] = [];

  for (const job of payload.jobs) {
    const normalizedUrl = job.url ? normalizeJobUrl(job.url) : "";

    // Skip jobs without a valid URL or title
    if (!normalizedUrl || !job.title) {
      errors++;
      continue;
    }

    try {
      // Check for existing job by URL or external_id
      let existingQuery = supabaseServer
        .from("job_posts")
        .select("id")
        .eq("url", normalizedUrl);

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
          .order("created_at", { ascending: false })
          .limit(1)
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
      const { data: insertedPost, error: insertError } = await supabaseServer
        .from("job_posts")
        .insert({
          url: normalizedUrl,
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
        })
        .select("id")
        .single();

      if (insertError) {
        // Check if it's a unique constraint violation (race condition)
        if (insertError.code === "23505") {
          duplicates++;
        } else {
          errors++;
        }
      } else {
        saved++;
        if (insertedPost?.id) {
          insertedJobIds.push(insertedPost.id);
        }
      }
    } catch (e) {
      errors++;
    }
  }

  // Auto-match newly saved jobs against all active seekers (background)
  if (insertedJobIds.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < insertedJobIds.length; i += chunkSize) {
      const chunk = insertedJobIds.slice(i, i + chunkSize);
      enqueueBackgroundJob("AUTO_MATCH_JOB_POSTS", {
        job_post_ids: chunk,
      }).catch((err) => console.error("Discovery auto-match enqueue failed:", err));
    }
  }

  return Response.json({
    success: true,
    saved,
    duplicates,
    errors,
    total: payload.jobs.length,
  });
}
