import { requireOpsAuth } from "@/lib/ops-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { computeMatchScore, parseJobPost } from "@/lib/matching";
import { detectAtsType, getInitialStep } from "@/lib/apply";
import { tailorResume } from "@/lib/resume-tailor";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { randomUUID } from "crypto";

type BackgroundJobRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  attempts: number | null;
  max_attempts: number | null;
};

type JobPostRow = {
  id: string;
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  description_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  seniority_level: string | null;
  work_type: string | null;
  years_experience_min: number | null;
  years_experience_max: number | null;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  industry: string | null;
  company_size: string | null;
  offers_visa_sponsorship: boolean | null;
  employment_type: string | null;
  parsed_at: string | null;
};

const RETRY_BASE_MS = 60 * 1000;
const RETRY_MAX_MS = 30 * 60 * 1000;
const IS_PROD =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const DEFAULT_THRESHOLD = Number(process.env.AUTO_QUEUE_DEFAULT_THRESHOLD ?? 60);
const AUTO_QUEUE_ALLOWED_RECOMMENDATIONS = new Set(
  (process.env.AUTO_QUEUE_ALLOWED_RECOMMENDATIONS ?? "strong_match,good_match")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);
const AUTO_TAILOR_ENABLED = resolveFlag(
  "AUTO_TAILOR_ENABLED",
  Boolean(process.env.OPENAI_API_KEY)
);
const AUTO_TAILOR_REQUIRED = resolveFlag("AUTO_TAILOR_REQUIRED", false);
const AUTO_APPLY_ENABLED = resolveFlag("AUTO_APPLY_ENABLED", IS_PROD);
const AUTO_APPLY_ALLOWED_ATS = new Set(
  (process.env.AUTO_APPLY_ALLOWED_ATS ?? "LINKEDIN,GREENHOUSE,WORKDAY")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
);
const AUTO_APPLY_MAX_RETRIES = Number(process.env.AUTO_APPLY_MAX_RETRIES ?? 2);
const AUTO_OUTREACH_ENABLED = resolveFlag("AUTO_OUTREACH_ENABLED", IS_PROD);
const AUTO_OUTREACH_CONTACT_LIMIT = Math.max(
  Number(process.env.AUTO_OUTREACH_CONTACT_LIMIT ?? 1),
  1
);

function normalizeList(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveFlag(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function pickJobPostIds(payload: Record<string, unknown>) {
  const ids = new Set<string>();
  const single = payload.job_post_id;
  if (typeof single === "string" && single.trim()) {
    ids.add(single.trim());
  }
  const list = payload.job_post_ids;
  if (Array.isArray(list)) {
    for (const value of list) {
      if (typeof value === "string" && value.trim()) {
        ids.add(value.trim());
      }
    }
  }
  return Array.from(ids);
}

function getAmId(payload: Record<string, unknown>) {
  const amId = payload.am_id;
  if (typeof amId === "string" && amId.trim()) {
    return amId.trim();
  }
  return null;
}

function getPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function getPayloadStringArray(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function buildWeights(customWeights: Record<string, number> | null) {
  if (!customWeights) {
    return undefined;
  }
  return {
    skills: customWeights.skills ?? 35,
    title: customWeights.title ?? 20,
    experience: customWeights.experience ?? 10,
    salary: customWeights.salary ?? 10,
    location: customWeights.location ?? 15,
    company_fit: customWeights.company_fit ?? 10,
    max_penalty: customWeights.max_penalty ?? 15,
  };
}

async function flagQueueAttention(
  queueId: string,
  reason: string,
  message?: string
) {
  const nowIso = new Date().toISOString();
  await supabaseServer
    .from("application_queue")
    .update({
      status: "NEEDS_ATTENTION",
      category: "needs_attention",
      last_error: message ?? reason,
      updated_at: nowIso,
    })
    .eq("id", queueId);

  await supabaseServer.from("attention_items").insert({
    queue_id: queueId,
    status: "OPEN",
    reason,
  });
}

async function ensureParsedJobPost(jobPost: JobPostRow) {
  if (jobPost.parsed_at || !jobPost.description_text) {
    return jobPost;
  }

  const parsed = parseJobPost(
    jobPost.title ?? "",
    jobPost.company ?? null,
    jobPost.location ?? null,
    jobPost.description_text
  );

  const parsedAt = new Date().toISOString();
  await supabaseServer
    .from("job_posts")
    .update({
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
      parsed_at: parsedAt,
    })
    .eq("id", jobPost.id);

  return { ...jobPost, ...parsed, parsed_at: parsedAt };
}

async function runAutoMatch(payload: Record<string, unknown>) {
  const jobPostIds = pickJobPostIds(payload);
  if (jobPostIds.length === 0) {
    return;
  }

  const amId = getAmId(payload);
  let seekerIds: string[] | null = null;

  if (amId) {
    const { data: assignments } = await supabaseServer
      .from("job_seeker_assignments")
      .select("job_seeker_id")
      .eq("account_manager_id", amId);
    seekerIds = (assignments ?? []).map((row) => row.job_seeker_id);
    if (seekerIds.length === 0) {
      return;
    }
  }

  let seekerQuery = supabaseServer
    .from("job_seekers")
    .select(`
      id, location, seniority, salary_min, salary_max, work_type,
      target_titles, skills, resume_text, match_threshold, match_weights,
      preferred_industries, preferred_company_sizes, exclude_keywords,
      years_experience, preferred_locations, open_to_relocation,
      requires_visa_sponsorship, location_preferences
    `)
    .eq("status", "active");

  if (seekerIds) {
    seekerQuery = seekerQuery.in("id", seekerIds);
  }

  const { data: seekers } = await seekerQuery;
  if (!seekers || seekers.length === 0) {
    return;
  }

  const { data: rawJobPosts } = await supabaseServer
    .from("job_posts")
    .select(`
      id, url, title, company, location, description_text,
      salary_min, salary_max, seniority_level, work_type,
      years_experience_min, years_experience_max,
      required_skills, preferred_skills, industry, company_size,
      offers_visa_sponsorship, employment_type, parsed_at
    `)
    .in("id", jobPostIds);

  if (!rawJobPosts || rawJobPosts.length === 0) {
    return;
  }

  const jobPosts: JobPostRow[] = [];
  for (const jobPost of rawJobPosts as JobPostRow[]) {
    const parsed = await ensureParsedJobPost(jobPost);
    jobPosts.push(parsed);
  }

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

    const threshold =
      typeof seekerData.match_threshold === "number"
        ? seekerData.match_threshold
        : DEFAULT_THRESHOLD;
    const customWeights = seekerData.match_weights as Record<string, number> | null;
    const weights = buildWeights(customWeights);

    const { data: routingDecisions } = await supabaseServer
      .from("job_routing_decisions")
      .select("job_post_id, decision")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", jobPostIds);

    const decisionMap = new Map(
      (routingDecisions ?? []).map((decision) => [decision.job_post_id, decision.decision])
    );

    const candidates: Array<{ job_post_id: string }> = [];
    const nowIso = new Date().toISOString();

    for (const jobPost of jobPosts) {
      const job = {
        id: jobPost.id,
        url: jobPost.url ?? "",
        title: jobPost.title ?? "",
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
          updated_at: nowIso,
        },
        { onConflict: "job_post_id,job_seeker_id" }
      );

      const decision = decisionMap.get(jobPost.id);
      if (decision === "OVERRIDDEN_OUT") {
        continue;
      }

      const recommendation = String(matchResult.recommendation ?? "").toLowerCase();
      const eligibleByScore =
        matchResult.score >= threshold &&
        AUTO_QUEUE_ALLOWED_RECOMMENDATIONS.has(recommendation);
      const eligible = decision === "OVERRIDDEN_IN" || eligibleByScore;

      if (eligible) {
        candidates.push({ job_post_id: jobPost.id });
      }
    }

    if (candidates.length === 0) {
      continue;
    }

    const candidateIds = candidates.map((c) => c.job_post_id);
    const { data: existingQueue } = await supabaseServer
      .from("application_queue")
      .select("job_post_id")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", candidateIds);

    const { data: existingRuns } = await supabaseServer
      .from("application_runs")
      .select("job_post_id")
      .eq("job_seeker_id", seeker.id)
      .in("job_post_id", candidateIds);

    const alreadyQueued = new Set([
      ...(existingQueue ?? []).map((row) => row.job_post_id),
      ...(existingRuns ?? []).map((row) => row.job_post_id),
    ]);

    const queueRows = candidateIds
      .filter((id) => !alreadyQueued.has(id))
      .map((jobPostId) => ({
        job_seeker_id: seeker.id,
        job_post_id: jobPostId,
        status: "QUEUED",
        category: "auto_matched",
        updated_at: nowIso,
      }));

    if (queueRows.length === 0) {
      continue;
    }

    const { data: insertedRows } = await supabaseServer
      .from("application_queue")
      .insert(queueRows)
      .select("id, job_seeker_id, job_post_id");

    if (!AUTO_APPLY_ENABLED || !insertedRows) {
      continue;
    }

    for (const row of insertedRows) {
      if (AUTO_TAILOR_ENABLED) {
        await enqueueBackgroundJob("TAILOR_RESUME", {
          queue_id: row.id,
          job_seeker_id: row.job_seeker_id,
          job_post_id: row.job_post_id,
        });
      } else {
        await enqueueBackgroundJob("AUTO_START_RUN", {
          queue_id: row.id,
          job_seeker_id: row.job_seeker_id,
          job_post_id: row.job_post_id,
        });
      }
    }
  }
}

async function runTailorResume(payload: Record<string, unknown>) {
  const jobSeekerId = getPayloadString(payload, "job_seeker_id");
  const jobPostId = getPayloadString(payload, "job_post_id");
  const queueId = getPayloadString(payload, "queue_id");

  if (!jobSeekerId || !jobPostId) {
    throw new Error("Missing job_seeker_id or job_post_id.");
  }

  const { data: existingTailored } = await supabaseServer
    .from("tailored_resumes")
    .select("id")
    .eq("job_seeker_id", jobSeekerId)
    .eq("job_post_id", jobPostId)
    .maybeSingle();

  if (existingTailored?.id) {
    if (AUTO_APPLY_ENABLED && queueId) {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: queueId,
        job_seeker_id: jobSeekerId,
        job_post_id: jobPostId,
      });
    }
    return;
  }

  if (!AUTO_TAILOR_ENABLED) {
    if (AUTO_APPLY_ENABLED && queueId) {
      await enqueueBackgroundJob("AUTO_START_RUN", {
        queue_id: queueId,
        job_seeker_id: jobSeekerId,
        job_post_id: jobPostId,
      });
    }
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    if (AUTO_TAILOR_REQUIRED && queueId) {
      await flagQueueAttention(queueId, "TAILOR_REQUIRED", "OpenAI not configured.");
    }
    return;
  }

  const { data: seeker } = await supabaseServer
    .from("job_seekers")
    .select("resume_text")
    .eq("id", jobSeekerId)
    .maybeSingle();

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("title, company, description_text, required_skills, preferred_skills")
    .eq("id", jobPostId)
    .maybeSingle();

  if (!seeker?.resume_text || !jobPost?.description_text) {
    if (queueId) {
      await flagQueueAttention(queueId, "TAILOR_INPUT_MISSING", "Resume or job description missing.");
    }
    return;
  }

  const result = await tailorResume({
    resumeText: seeker.resume_text,
    jobTitle: jobPost.title ?? "",
    company: jobPost.company ?? null,
    jobDescription: jobPost.description_text ?? null,
    requiredSkills: (jobPost.required_skills as string[] | null) ?? null,
    preferredSkills: (jobPost.preferred_skills as string[] | null) ?? null,
  });

  const nowIso = new Date().toISOString();
  await supabaseServer.from("tailored_resumes").upsert(
    {
      job_seeker_id: jobSeekerId,
      job_post_id: jobPostId,
      tailored_text: result.tailoredText,
      changes_summary: result.changesSummary,
      updated_at: nowIso,
    },
    { onConflict: "job_seeker_id,job_post_id" }
  );

  if (AUTO_APPLY_ENABLED && queueId) {
    await enqueueBackgroundJob("AUTO_START_RUN", {
      queue_id: queueId,
      job_seeker_id: jobSeekerId,
      job_post_id: jobPostId,
    });
  }
}

async function runAutoStartRun(payload: Record<string, unknown>) {
  if (!AUTO_APPLY_ENABLED) {
    return;
  }

  const queueId = getPayloadString(payload, "queue_id");
  const jobSeekerId = getPayloadString(payload, "job_seeker_id");
  const jobPostId = getPayloadString(payload, "job_post_id");

  let queueItem:
    | {
        id: string;
        job_seeker_id: string;
        job_post_id: string;
        status: string;
      }
    | null = null;

  if (queueId) {
    const { data } = await supabaseServer
      .from("application_queue")
      .select("id, job_seeker_id, job_post_id, status")
      .eq("id", queueId)
      .maybeSingle();
    queueItem = data ?? null;
  } else if (jobSeekerId && jobPostId) {
    const { data } = await supabaseServer
      .from("application_queue")
      .select("id, job_seeker_id, job_post_id, status")
      .eq("job_seeker_id", jobSeekerId)
      .eq("job_post_id", jobPostId)
      .maybeSingle();
    queueItem = data ?? null;
  }

  if (!queueItem) {
    return;
  }

  if (["NEEDS_ATTENTION", "FAILED", "CANCELLED", "APPLIED", "COMPLETED"].includes(queueItem.status)) {
    return;
  }

  const { data: existingRun } = await supabaseServer
    .from("application_runs")
    .select("id")
    .eq("queue_id", queueItem.id)
    .maybeSingle();

  if (existingRun?.id) {
    return;
  }

  if (AUTO_TAILOR_REQUIRED) {
    const { data: tailored } = await supabaseServer
      .from("tailored_resumes")
      .select("id")
      .eq("job_seeker_id", queueItem.job_seeker_id)
      .eq("job_post_id", queueItem.job_post_id)
      .maybeSingle();

    if (!tailored?.id) {
      if (AUTO_TAILOR_ENABLED) {
        await supabaseServer
          .from("application_queue")
          .update({
            category: "tailor_pending",
            last_error: "TAILOR_PENDING",
            updated_at: new Date().toISOString(),
          })
          .eq("id", queueItem.id);
        await enqueueBackgroundJob("TAILOR_RESUME", {
          queue_id: queueItem.id,
          job_seeker_id: queueItem.job_seeker_id,
          job_post_id: queueItem.job_post_id,
        });
      } else {
        await flagQueueAttention(queueItem.id, "TAILOR_REQUIRED", "Tailored resume required.");
      }
      return;
    }
  }

  const { data: jobPost } = await supabaseServer
    .from("job_posts")
    .select("id, source, url")
    .eq("id", queueItem.job_post_id)
    .maybeSingle();

  if (!jobPost?.id) {
    await flagQueueAttention(queueItem.id, "JOB_POST_MISSING", "Job post not found.");
    return;
  }

  const atsType = detectAtsType(jobPost.source, jobPost.url);
  if (!AUTO_APPLY_ALLOWED_ATS.has(atsType)) {
    await flagQueueAttention(queueItem.id, "ATS_UNSUPPORTED", `ATS not allowed: ${atsType}`);
    return;
  }

  const initialStep = getInitialStep(atsType);
  const nowIso = new Date().toISOString();
  const maxRetries = Number.isFinite(AUTO_APPLY_MAX_RETRIES) ? AUTO_APPLY_MAX_RETRIES : 2;

  const { data: createdRun, error: createError } = await supabaseServer
    .from("application_runs")
    .insert({
      queue_id: queueItem.id,
      job_seeker_id: queueItem.job_seeker_id,
      job_post_id: queueItem.job_post_id,
      ats_type: atsType,
      status: "READY",
      current_step: initialStep,
      max_retries: maxRetries,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (createError || !createdRun) {
    throw new Error("Failed to create application run.");
  }

  await supabaseServer
    .from("application_queue")
    .update({ status: "READY", category: "in_progress", updated_at: nowIso })
    .eq("id", queueItem.id);

  await supabaseServer.from("application_step_events").insert({
    run_id: createdRun.id,
    step: initialStep,
    event_type: "READY",
    message: "Run ready for execution.",
  });

  await supabaseServer.from("apply_run_events").insert({
    run_id: createdRun.id,
    level: "INFO",
    event_type: "READY",
    actor: "SYSTEM",
    payload: { step: initialStep },
  });
}

async function runAutoOutreach(payload: Record<string, unknown>) {
  if (!AUTO_OUTREACH_ENABLED) {
    return;
  }

  const jobSeekerId = getPayloadString(payload, "job_seeker_id");
  const jobPostId = getPayloadString(payload, "job_post_id");
  if (!jobSeekerId || !jobPostId) {
    throw new Error("Missing job_seeker_id or job_post_id for outreach.");
  }

  const contactIds = getPayloadStringArray(payload, "contact_ids");
  let draftQuery = supabaseServer
    .from("outreach_drafts")
    .select(
      "id, contact_id, subject, body, status, outreach_contacts (id, full_name, email, role, company_name)"
    )
    .eq("job_seeker_id", jobSeekerId)
    .eq("job_post_id", jobPostId)
    .eq("status", "DRAFT")
    .order("created_at", { ascending: true })
    .limit(AUTO_OUTREACH_CONTACT_LIMIT);

  if (contactIds.length > 0) {
    draftQuery = draftQuery.in("contact_id", contactIds);
  }

  const { data: drafts } = await draftQuery;
  if (!drafts || drafts.length === 0) {
    return;
  }

  const opsKey = process.env.OPS_API_KEY;
  if (!opsKey) {
    throw new Error("OPS_API_KEY is required for auto outreach.");
  }

  const baseUrl = getBaseUrl();

  for (const draftRow of drafts) {
    const contact = Array.isArray(draftRow.outreach_contacts)
      ? draftRow.outreach_contacts[0]
      : draftRow.outreach_contacts;
    const email = contact?.email ?? null;

    if (!draftRow.subject || !draftRow.body || !email) {
      await supabaseServer
        .from("outreach_drafts")
        .update({
          status: "FAILED",
          last_error: "Missing subject, body, or contact email.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftRow.id);
      continue;
    }

    const { data: existingRecruiter } = await supabaseServer
      .from("recruiters")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    let recruiterId = existingRecruiter?.id ?? null;
    if (!recruiterId) {
      const { data: insertedRecruiter, error: recruiterError } = await supabaseServer
        .from("recruiters")
        .insert({
          name: contact?.full_name ?? email,
          title: contact?.role ?? null,
          company: contact?.company_name ?? null,
          email,
          source: "auto_apply",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (recruiterError || !insertedRecruiter) {
        await supabaseServer
          .from("outreach_drafts")
          .update({
            status: "FAILED",
            last_error: "Failed to create recruiter.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", draftRow.id);
        continue;
      }
      recruiterId = insertedRecruiter.id;
    }

    const { data: thread } = await supabaseServer
      .from("recruiter_threads")
      .select("id")
      .eq("recruiter_id", recruiterId)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle();

    if (thread?.id) {
      const { data: outboundMessages } = await supabaseServer
        .from("outreach_messages")
        .select("id")
        .eq("recruiter_thread_id", thread.id)
        .eq("direction", "OUTBOUND")
        .limit(1);

      if ((outboundMessages ?? []).length > 0) {
        await supabaseServer
          .from("outreach_drafts")
          .update({
            status: "SKIPPED",
            last_error: "Existing outreach message found.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", draftRow.id);
        continue;
      }
    }

    const response = await fetch(`${baseUrl}/api/outreach/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ops-key": opsKey,
      },
      body: JSON.stringify({
        recruiter_id: recruiterId,
        job_seeker_id: jobSeekerId,
        subject: draftRow.subject,
        body: draftRow.body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await supabaseServer
        .from("outreach_drafts")
        .update({
          status: "FAILED",
          last_error: errorText || `Send failed (${response.status}).`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftRow.id);
      continue;
    }

    await supabaseServer
      .from("outreach_drafts")
      .update({
        status: "SENT",
        sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftRow.id);
  }
}

async function handleJob(job: BackgroundJobRow) {
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    throw new Error("Invalid payload.");
  }

  switch (job.type) {
    case "AUTO_MATCH_JOB_POST":
    case "AUTO_MATCH_JOB_POSTS":
      await runAutoMatch(job.payload);
      return;
    case "TAILOR_RESUME":
      await runTailorResume(job.payload);
      return;
    case "AUTO_START_RUN":
      await runAutoStartRun(job.payload);
      return;
    case "AUTO_OUTREACH":
      await runAutoOutreach(job.payload);
      return;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

async function runJobs(request: Request) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "5");
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 20)
      : 5;
  const nowIso = new Date().toISOString();
  const workerId = `background:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;

  const { data: queuedJobs, error } = await supabaseServer
    .from("background_jobs")
    .select("id, type, payload, attempts, max_attempts")
    .in("status", ["QUEUED", "RETRY"])
    .lte("run_at", nowIso)
    .is("locked_at", null)
    .order("run_at", { ascending: true })
    .limit(limit);

  if (error) {
    return Response.json({ success: false, error: "Failed to load jobs." }, { status: 500 });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const job of (queuedJobs ?? []) as BackgroundJobRow[]) {
    const { data: lockedJob } = await supabaseServer
      .from("background_jobs")
      .update({
        status: "RUNNING",
        locked_at: nowIso,
        locked_by: workerId,
        updated_at: nowIso,
      })
      .eq("id", job.id)
      .is("locked_at", null)
      .in("status", ["QUEUED", "RETRY"])
      .select("id, type, payload, attempts, max_attempts")
      .single();

    if (!lockedJob) {
      continue;
    }

    try {
      await handleJob(lockedJob as BackgroundJobRow);
      await supabaseServer
        .from("background_jobs")
        .update({
          status: "DONE",
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lockedJob.id);
      results.push({ id: lockedJob.id, status: "DONE" });
    } catch (err) {
      const attempts = (lockedJob.attempts ?? 0) + 1;
      const maxAttempts = lockedJob.max_attempts ?? 3;
      const retry = attempts < maxAttempts;
      const delayMs = Math.min(RETRY_BASE_MS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_MS);
      const nextRunAt = new Date(Date.now() + delayMs).toISOString();
      const errorMessage = err instanceof Error ? err.message : "Job failed.";

      if (!retry && lockedJob.payload && typeof lockedJob.payload === "object" && !Array.isArray(lockedJob.payload)) {
        const payload = lockedJob.payload as Record<string, unknown>;
        const queueId = getPayloadString(payload, "queue_id");
        if (queueId && lockedJob.type === "TAILOR_RESUME") {
          await flagQueueAttention(queueId, "TAILOR_FAILED", errorMessage);
        }
        if (queueId && lockedJob.type === "AUTO_START_RUN") {
          await flagQueueAttention(queueId, "AUTO_START_FAILED", errorMessage);
        }
      }

      await supabaseServer
        .from("background_jobs")
        .update({
          status: retry ? "RETRY" : "FAILED",
          attempts,
          last_error: errorMessage,
          locked_at: null,
          locked_by: null,
          run_at: retry ? nextRunAt : nowIso,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lockedJob.id);

      results.push({
        id: lockedJob.id,
        status: retry ? "RETRY" : "FAILED",
        error: errorMessage,
      });
    }
  }

  return Response.json({ success: true, processed: results.length, results });
}

export async function POST(request: Request) {
  return runJobs(request);
}

export async function GET(request: Request) {
  return runJobs(request);
}
