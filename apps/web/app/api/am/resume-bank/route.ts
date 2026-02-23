import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { renderResumePdf } from "@/lib/resume-templates";
import type { ResumeTemplateId, StructuredResume } from "@/lib/resume-templates";
import {
  normalizeJobTitle,
  structuredResumeToText,
} from "@/lib/resume-bank";

function isMissingResumeBankTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === "42P01" ||
    String(maybe.message ?? "").toLowerCase().includes("resume_bank_versions") ||
    String(maybe.message ?? "").toLowerCase().includes("resume_hardening_alerts")
  );
}

async function uploadResumeBankPdf(params: {
  jobSeekerId: string;
  versionId: string;
  data: StructuredResume;
  templateId: ResumeTemplateId;
}) {
  try {
    const pdfBuffer = renderResumePdf(params.data, params.templateId);
    const storagePath = `${params.jobSeekerId}/bank/${params.versionId}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("resumes")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return null;
    }

    const { data: signedUrlData } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

    if (signedUrlData?.signedUrl) {
      return signedUrlData.signedUrl;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("resumes")
      .getPublicUrl(storagePath);

    return urlData.publicUrl ?? null;
  } catch {
    return null;
  }
}

async function createResumeVersion(params: {
  jobSeekerId: string;
  name: string;
  titleFocus: string | null;
  source: "manual" | "hardened" | "imported" | "ai";
  templateId: ResumeTemplateId;
  resumeText: string;
  resumeData: StructuredResume | null;
  resumeUrl: string | null;
  makeDefault: boolean;
  createdByAmId: string;
  approvedByAmId?: string;
}) {
  const versionId = randomUUID();

  let computedResumeUrl = params.resumeUrl;
  if (!computedResumeUrl && params.resumeData) {
    computedResumeUrl = await uploadResumeBankPdf({
      jobSeekerId: params.jobSeekerId,
      versionId,
      data: params.resumeData,
      templateId: params.templateId,
    });
  }

  if (params.makeDefault) {
    await supabaseAdmin
      .from("resume_bank_versions")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("job_seeker_id", params.jobSeekerId)
      .eq("status", "active");
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("resume_bank_versions")
    .insert({
      id: versionId,
      job_seeker_id: params.jobSeekerId,
      name: params.name,
      title_focus: params.titleFocus,
      source: params.source,
      status: "active",
      is_default: params.makeDefault,
      template_id: params.templateId,
      resume_url: computedResumeUrl,
      resume_text: params.resumeText,
      resume_data: params.resumeData,
      created_by_am_id: params.createdByAmId,
      approved_by_am_id: params.approvedByAmId ?? null,
      approved_at: params.approvedByAmId ? nowIso : null,
      updated_at: nowIso,
    })
    .select(
      "id, job_seeker_id, name, title_focus, source, status, is_default, template_id, resume_url, created_at, updated_at"
    )
    .single();

  if (error) {
    return { error: error.message, version: null } as const;
  }

  return { error: null, version: data } as const;
}

export async function GET(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const jobSeekerId = searchParams.get("job_seeker_id");

  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: versions, error: versionsError } = await supabaseAdmin
    .from("resume_bank_versions")
    .select(
      "id, job_seeker_id, name, title_focus, source, status, is_default, template_id, resume_url, created_at, updated_at"
    )
    .eq("job_seeker_id", jobSeekerId)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (versionsError) {
    if (isMissingResumeBankTable(versionsError)) {
      return NextResponse.json({ versions: [], alerts: [], migration_missing: true });
    }
    return NextResponse.json({ error: "Failed to load resume bank versions." }, { status: 500 });
  }

  const { data: alerts, error: alertsError } = await supabaseAdmin
    .from("resume_hardening_alerts")
    .select(
      "id, job_seeker_id, normalized_title, sample_title, tailored_count, status, last_triggered_at, created_at, updated_at"
    )
    .eq("job_seeker_id", jobSeekerId)
    .eq("status", "pending")
    .order("last_triggered_at", { ascending: false });

  if (alertsError) {
    if (isMissingResumeBankTable(alertsError)) {
      return NextResponse.json({ versions: versions ?? [], alerts: [], migration_missing: true });
    }
    return NextResponse.json({ error: "Failed to load hardening alerts." }, { status: 500 });
  }

  return NextResponse.json({ versions: versions ?? [], alerts: alerts ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const jobSeekerId = String(body.job_seeker_id ?? "").trim();
  const fromJobPostId = String(body.from_job_post_id ?? "").trim() || null;
  const rawName = String(body.name ?? "").trim();
  const makeDefault = Boolean(body.make_default);
  const source = (String(body.source ?? "manual") as "manual" | "hardened" | "imported" | "ai");

  if (!jobSeekerId) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let templateId = (String(body.template_id ?? "classic") || "classic") as ResumeTemplateId;
  let resumeText = String(body.resume_text ?? "").trim();
  let resumeData = (body.resume_data ?? null) as StructuredResume | null;
  let resumeUrl = String(body.resume_url ?? "").trim() || null;
  let titleFocus = String(body.title_focus ?? "").trim() || null;

  if (fromJobPostId) {
    const { data: tailored } = await supabaseAdmin
      .from("tailored_resumes")
      .select("tailored_text, tailored_data, template_id, resume_url")
      .eq("job_seeker_id", jobSeekerId)
      .eq("job_post_id", fromJobPostId)
      .maybeSingle();

    if (!tailored?.tailored_text && !tailored?.tailored_data) {
      return NextResponse.json({ error: "No tailored resume exists for that job yet." }, { status: 404 });
    }

    const { data: jobPost } = await supabaseAdmin
      .from("job_posts")
      .select("title")
      .eq("id", fromJobPostId)
      .maybeSingle();

    titleFocus = titleFocus ?? jobPost?.title ?? null;
    templateId = (tailored?.template_id || templateId) as ResumeTemplateId;
    resumeData = (tailored?.tailored_data as StructuredResume | null) ?? resumeData;
    resumeText = tailored?.tailored_text ?? resumeText;
    resumeUrl = tailored?.resume_url ?? resumeUrl;
  }

  if (!resumeText && resumeData) {
    resumeText = structuredResumeToText(resumeData);
  }

  if (!resumeText) {
    return NextResponse.json({ error: "resume_text or resume_data is required." }, { status: 400 });
  }

  const name = rawName || (titleFocus ? `${titleFocus} version` : "Reusable Resume Version");

  const created = await createResumeVersion({
    jobSeekerId,
    name,
    titleFocus,
    source,
    templateId,
    resumeText,
    resumeData,
    resumeUrl,
    makeDefault,
    createdByAmId: auth.user.id,
  });

  if (created.error) {
    if (isMissingResumeBankTable({ message: created.error })) {
      return NextResponse.json(
        { error: "Resume bank migration is not applied yet. Run migration 054 first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to create resume bank version." }, { status: 500 });
  }

  return NextResponse.json({ version: created.version });
}

export async function PATCH(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const action = String(body.action ?? "").trim();
  const jobSeekerId = String(body.job_seeker_id ?? "").trim();

  if (!action || !jobSeekerId) {
    return NextResponse.json({ error: "action and job_seeker_id are required." }, { status: 400 });
  }

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  if (action === "set_default") {
    const versionId = String(body.version_id ?? "").trim();
    if (!versionId) {
      return NextResponse.json({ error: "version_id is required." }, { status: 400 });
    }

    await supabaseAdmin
      .from("resume_bank_versions")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "active");

    const { error } = await supabaseAdmin
      .from("resume_bank_versions")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "active");

    if (error) {
      return NextResponse.json({ error: "Failed to set default version." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === "archive") {
    const versionId = String(body.version_id ?? "").trim();
    if (!versionId) {
      return NextResponse.json({ error: "version_id is required." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("resume_bank_versions")
      .update({ status: "archived", is_default: false, updated_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("job_seeker_id", jobSeekerId);

    if (error) {
      return NextResponse.json({ error: "Failed to archive version." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === "dismiss_alert") {
    const alertId = String(body.alert_id ?? "").trim();
    if (!alertId) {
      return NextResponse.json({ error: "alert_id is required." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("resume_hardening_alerts")
      .update({
        status: "dismissed",
        resolved_by_am_id: auth.user.id,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", alertId)
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "pending");

    if (error) {
      return NextResponse.json({ error: "Failed to dismiss alert." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === "approve_alert") {
    const alertId = String(body.alert_id ?? "").trim();
    const explicitName = String(body.name ?? "").trim();

    if (!alertId) {
      return NextResponse.json({ error: "alert_id is required." }, { status: 400 });
    }

    const { data: alert } = await supabaseAdmin
      .from("resume_hardening_alerts")
      .select("id, normalized_title, sample_title, status")
      .eq("id", alertId)
      .eq("job_seeker_id", jobSeekerId)
      .maybeSingle();

    if (!alert || alert.status !== "pending") {
      return NextResponse.json({ error: "Pending alert not found." }, { status: 404 });
    }

    const { data: tailoredRows } = await supabaseAdmin
      .from("tailored_resumes")
      .select("id, job_post_id, tailored_text, tailored_data, template_id, resume_url, updated_at")
      .eq("job_seeker_id", jobSeekerId)
      .order("updated_at", { ascending: false });

    const jobPostIds = Array.from(
      new Set((tailoredRows ?? []).map((row) => row.job_post_id).filter(Boolean))
    );

    if (jobPostIds.length === 0) {
      return NextResponse.json({ error: "No tailored resumes available to harden." }, { status: 400 });
    }

    const { data: jobPosts } = await supabaseAdmin
      .from("job_posts")
      .select("id, title")
      .in("id", jobPostIds);

    const titleByJobPostId = new Map<string, string>();
    for (const row of jobPosts ?? []) {
      titleByJobPostId.set(row.id, row.title ?? "");
    }

    const candidate = (tailoredRows ?? []).find((row) => {
      const postTitle = titleByJobPostId.get(row.job_post_id) ?? "";
      return normalizeJobTitle(postTitle) === alert.normalized_title;
    });

    if (!candidate) {
      return NextResponse.json({ error: "No matching tailored resume found for this title." }, { status: 400 });
    }

    const resumeData = (candidate.tailored_data as StructuredResume | null) ?? null;
    const resumeText = candidate.tailored_text || (resumeData ? structuredResumeToText(resumeData) : "");

    if (!resumeText) {
      return NextResponse.json({ error: "Selected tailored resume has no text." }, { status: 400 });
    }

    const versionName = explicitName || `${alert.sample_title} Hardened Version`;

    const created = await createResumeVersion({
      jobSeekerId,
      name: versionName,
      titleFocus: alert.sample_title,
      source: "hardened",
      templateId: (candidate.template_id || "classic") as ResumeTemplateId,
      resumeText,
      resumeData,
      resumeUrl: candidate.resume_url,
      makeDefault: Boolean(body.make_default),
      createdByAmId: auth.user.id,
      approvedByAmId: auth.user.id,
    });

    if (created.error || !created.version) {
      return NextResponse.json({ error: "Failed to create hardened resume version." }, { status: 500 });
    }

    const { error: resolveError } = await supabaseAdmin
      .from("resume_hardening_alerts")
      .update({
        status: "approved",
        resolved_by_am_id: auth.user.id,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", alert.id);

    if (resolveError) {
      return NextResponse.json({ error: "Hardened version created, but alert could not be resolved." }, { status: 500 });
    }

    return NextResponse.json({ success: true, version: created.version });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
