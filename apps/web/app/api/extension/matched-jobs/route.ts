import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/auth";
import { verifyExtensionSession } from "@/lib/extension-auth";

/**
 * GET /api/extension/matched-jobs
 *
 * Returns matched jobs for the active job seeker in the extension session.
 * Joins job_match_scores → job_posts, and LEFT JOINs application_queue
 * to show queue status.
 */
export async function GET(request: Request) {
  try {
    const session = await verifyExtensionSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 }
      );
    }

    if (!session.active_job_seeker_id) {
      return NextResponse.json(
        { error: "No active job seeker selected." },
        { status: 400 }
      );
    }

    // Get seeker match threshold
    const { data: seeker } = await supabaseAdmin
      .from("job_seekers")
      .select("match_threshold")
      .eq("id", session.active_job_seeker_id)
      .single();

    const threshold = seeker?.match_threshold ?? 50;

    // Get matched jobs above threshold, only active jobs
    const { data: matches, error: matchError } = await supabaseAdmin
      .from("job_match_scores")
      .select(`
        score,
        confidence,
        recommendation,
        job_posts!inner (
          id,
          title,
          company,
          location,
          url,
          work_type,
          salary_min,
          salary_max,
          seniority_level,
          is_active,
          created_at
        )
      `)
      .eq("job_seeker_id", session.active_job_seeker_id)
      .gte("score", threshold)
      .order("score", { ascending: false })
      .limit(100);

    if (matchError) {
      console.error("Error fetching matched jobs:", matchError);
      return NextResponse.json(
        { error: "Failed to fetch matched jobs." },
        { status: 500 }
      );
    }

    // Get queue status for these jobs
    const jobIds = (matches || [])
      .map((m) => {
        const jp = m.job_posts as unknown as { id: string } | null;
        return jp?.id;
      })
      .filter(Boolean) as string[];

    let queueMap: Record<string, string> = {};
    if (jobIds.length > 0) {
      const { data: queueItems } = await supabaseAdmin
        .from("application_queue")
        .select("job_post_id, status")
        .eq("job_seeker_id", session.active_job_seeker_id)
        .in("job_post_id", jobIds);

      if (queueItems) {
        queueMap = Object.fromEntries(
          queueItems.map((q) => [q.job_post_id, q.status])
        );
      }
    }

    // Also check application_runs for applied status
    let runMap: Record<string, string> = {};
    if (jobIds.length > 0) {
      const { data: runs } = await supabaseAdmin
        .from("application_runs")
        .select("job_post_id, status")
        .eq("job_seeker_id", session.active_job_seeker_id)
        .in("job_post_id", jobIds);

      if (runs) {
        runMap = Object.fromEntries(
          runs.map((r) => [r.job_post_id, r.status])
        );
      }
    }

    const jobs = (matches || []).map((m) => {
      const jp = m.job_posts as unknown as {
        id: string;
        title: string;
        company: string | null;
        location: string | null;
        url: string;
        work_type: string | null;
        salary_min: number | null;
        salary_max: number | null;
        seniority_level: string | null;
        created_at: string;
      };

      return {
        id: jp.id,
        title: jp.title,
        company: jp.company,
        location: jp.location,
        url: jp.url,
        work_type: jp.work_type,
        salary_min: jp.salary_min,
        salary_max: jp.salary_max,
        seniority_level: jp.seniority_level,
        score: m.score,
        confidence: m.confidence,
        recommendation: m.recommendation,
        queue_status: queueMap[jp.id] || runMap[jp.id] || null,
        created_at: jp.created_at,
      };
    });

    return NextResponse.json({
      jobs,
      threshold,
      total: jobs.length,
    });
  } catch (error) {
    console.error("Extension matched-jobs error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
