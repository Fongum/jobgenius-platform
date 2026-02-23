import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { isOpenAIConfigured } from "@/lib/openai";
import {
  buildStructuredResumeFromSeeker,
  optimizeBaseResumeStructured,
  type SeekerRow,
} from "@/lib/resume-tailor";
import { renderResumePdf } from "@/lib/resume-templates";
import type { ResumeTemplateId, StructuredResume } from "@/lib/resume-templates";

type ResumeVersionRow = {
  id: string;
  template_id: string | null;
  resume_text: string | null;
  resume_data: StructuredResume | null;
};

type SeekerBaseRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  address_city: string | null;
  address_state: string | null;
  skills: string[] | null;
  work_history: unknown;
  education: unknown;
  bio: string | null;
  resume_template_id: string | null;
  target_titles: string[] | null;
  seniority: string | null;
  preferred_industries: string[] | null;
};

function isMissingResumeBankTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; details?: string };
  const text = `${row.message ?? ""} ${row.details ?? ""}`.toLowerCase();
  return row.code === "42P01" || text.includes("resume_bank_versions");
}

const SEEKER_SELECT_FIELDS =
  "id, full_name, email, phone, linkedin_url, address_city, address_state, skills, work_history, education, bio, resume_template_id, target_titles, seniority, preferred_industries";

async function resolveJobSeeker(identifier: string): Promise<SeekerBaseRow | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const { data: byId } = await supabaseAdmin
    .from("job_seekers")
    .select(SEEKER_SELECT_FIELDS)
    .eq("id", trimmed)
    .maybeSingle();
  if (byId?.id) return byId as SeekerBaseRow;

  if (trimmed.includes("@")) {
    const { data: byEmail } = await supabaseAdmin
      .from("job_seekers")
      .select(SEEKER_SELECT_FIELDS)
      .eq("email", trimmed)
      .maybeSingle();
    if (byEmail?.id) return byEmail as SeekerBaseRow;
  }

  const { data: byName } = await supabaseAdmin
    .from("job_seekers")
    .select(SEEKER_SELECT_FIELDS)
    .eq("full_name", trimmed)
    .limit(1);

  if (Array.isArray(byName) && byName.length > 0) {
    return byName[0] as SeekerBaseRow;
  }

  return null;
}

async function uploadBasePdf(params: {
  jobSeekerId: string;
  data: StructuredResume;
  templateId: ResumeTemplateId;
}) {
  try {
    const pdfBuffer = renderResumePdf(params.data, params.templateId);
    const storagePath = `${params.jobSeekerId}/base/base_resume.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("resumes")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) return null;

    const { data: signedUrlData } = await supabaseAdmin.storage
      .from("resumes")
      .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

    if (signedUrlData?.signedUrl) return signedUrlData.signedUrl;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("resumes")
      .getPublicUrl(storagePath);
    return publicUrlData.publicUrl ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OpenAI is not configured. Set OPENAI_API_KEY to enable resume optimization." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jobSeekerInput = String(body.job_seeker_id ?? "").trim();
  const selectedVersionId = String(body.resume_version_id ?? "").trim() || null;
  const forcedTemplateId = String(body.template_id ?? "").trim() || null;

  if (!jobSeekerInput) {
    return NextResponse.json({ error: "job_seeker_id is required." }, { status: 400 });
  }

  const seeker = await resolveJobSeeker(jobSeekerInput);
  if (!seeker?.id) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }
  const jobSeekerId = seeker.id;

  const [
    { data: explicitVersion, error: explicitVersionError },
    { data: defaultVersion, error: defaultVersionError },
  ] = await Promise.all([
    selectedVersionId
      ? supabaseAdmin
          .from("resume_bank_versions")
          .select("id, template_id, resume_text, resume_data")
          .eq("id", selectedVersionId)
          .eq("job_seeker_id", jobSeekerId)
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("resume_bank_versions")
      .select("id, template_id, resume_text, resume_data")
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "active")
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  if (!(await hasJobSeekerAccess(auth.user.id, jobSeekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  if (selectedVersionId) {
    if (explicitVersionError) {
      if (!isMissingResumeBankTable(explicitVersionError)) {
        return NextResponse.json(
          { error: "Failed to load selected resume version." },
          { status: 500 }
        );
      }
    }
    if (!explicitVersion?.id) {
      return NextResponse.json({ error: "Selected resume version not found." }, { status: 404 });
    }
  }

  if (defaultVersionError && !isMissingResumeBankTable(defaultVersionError)) {
    return NextResponse.json(
      { error: "Failed to load default resume version." },
      { status: 500 }
    );
  }

  const sourceVersion = (explicitVersion ?? defaultVersion ?? null) as ResumeVersionRow | null;
  const fallbackEmail =
    sourceVersion?.resume_data?.contact?.email?.trim() ||
    sourceVersion?.resume_text?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ||
    "candidate@jobgenius.local";
  const seekerEmail = seeker.email?.trim() || fallbackEmail;

  const templateId = (
    forcedTemplateId ||
    sourceVersion?.template_id ||
    seeker.resume_template_id ||
    "classic"
  ) as ResumeTemplateId;

  const baseResume =
    sourceVersion?.resume_data ??
    buildStructuredResumeFromSeeker({
      full_name: seeker.full_name ?? null,
      email: seekerEmail,
      phone: seeker.phone ?? null,
      linkedin_url: seeker.linkedin_url ?? null,
      address_city: seeker.address_city ?? null,
      address_state: seeker.address_state ?? null,
      bio: seeker.bio ?? null,
      skills: (seeker.skills as string[] | null) ?? null,
      work_history: seeker.work_history,
      education: seeker.education,
      resume_text: sourceVersion?.resume_text ?? null,
    } satisfies SeekerRow);

  const optimized = await optimizeBaseResumeStructured({
    baseResume,
    targetTitles: (seeker.target_titles as string[] | null) ?? null,
    seniority: typeof seeker.seniority === "string" ? seeker.seniority : null,
    preferredIndustries: (seeker.preferred_industries as string[] | null) ?? null,
    keySkills: (seeker.skills as string[] | null) ?? null,
  });

  const resumeUrl = await uploadBasePdf({
    jobSeekerId,
    data: optimized.tailoredData,
    templateId,
  });

  const { error: updateSeekerError } = await supabaseAdmin
    .from("job_seekers")
    .update({
      resume_text: optimized.tailoredText,
      resume_url: resumeUrl,
      resume_template_id: templateId,
    })
    .eq("id", jobSeekerId);

  if (updateSeekerError) {
    return NextResponse.json(
      { error: "Failed to update base resume on seeker profile." },
      { status: 500 }
    );
  }

  let createdVersion: {
    id: string;
    job_seeker_id: string;
    name: string;
    source: string;
    is_default: boolean;
    template_id: string | null;
    resume_url: string | null;
    created_at: string;
    updated_at: string;
  } | null = null;
  let bankWarning: string | null = null;

  try {
    await supabaseAdmin
      .from("resume_bank_versions")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("job_seeker_id", jobSeekerId)
      .eq("status", "active");

    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("resume_bank_versions")
      .insert({
        job_seeker_id: jobSeekerId,
        name: `Base ATS Optimized Resume (${nowIso.slice(0, 10)})`,
        title_focus: null,
        source: "ai",
        status: "active",
        is_default: true,
        template_id: templateId,
        resume_url: resumeUrl,
        resume_text: optimized.tailoredText,
        resume_data: optimized.tailoredData,
        created_by_am_id: auth.user.id,
        approved_by_am_id: auth.user.id,
        approved_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, job_seeker_id, name, source, is_default, template_id, resume_url, created_at, updated_at")
      .single();

    if (insertError) {
      if (isMissingResumeBankTable(insertError)) {
        bankWarning =
          "Base resume was optimized, but Resume Bank table is unavailable. Run migration 054.";
      } else {
        bankWarning =
          "Base resume was optimized, but saving default Resume Bank version failed.";
      }
    } else {
      createdVersion = inserted;
    }
  } catch {
    bankWarning =
      "Base resume was optimized, but saving default Resume Bank version failed.";
  }

  return NextResponse.json({
    base_resume: {
      job_seeker_id: jobSeekerId,
      template_id: templateId,
      tailored_data: optimized.tailoredData,
      tailored_text: optimized.tailoredText,
      changes_summary: optimized.changesSummary,
      resume_url: resumeUrl,
    },
    version: createdVersion,
    warning: bankWarning,
  });
}
