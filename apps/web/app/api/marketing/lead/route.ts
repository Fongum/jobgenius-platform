import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { enqueueBackgroundJob } from "@/lib/background-jobs";
import { normalizePhone } from "@/lib/voice/service";

type MarketingLeadPayload = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  target_roles?: string[] | string;
  notes?: string;
  consent_voice?: boolean;
  consent_marketing?: boolean;
  source?: string;
};

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseTargetRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

async function findExistingLead(email: string | null, phone: string | null) {
  if (email) {
    const { data: byEmail } = await supabaseServer
      .from("lead_intake_submissions")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (byEmail?.id) return byEmail.id as string;
  }

  if (phone) {
    const { data: byPhone } = await supabaseServer
      .from("lead_intake_submissions")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (byPhone?.id) return byPhone.id as string;
  }

  return null;
}

async function loadLeadQualificationPlaybook() {
  const { data } = await supabaseServer
    .from("voice_playbooks")
    .select("id, assistant_goal, system_prompt, max_retry_attempts")
    .eq("call_type", "lead_qualification")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as
    | {
        id: string;
        assistant_goal: string | null;
        system_prompt: string;
        max_retry_attempts: number | null;
      }
    | null;
}

export async function POST(request: Request) {
  let payload: MarketingLeadPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fullName = toText(payload.full_name);
  const email = toText(payload.email)?.toLowerCase() ?? null;
  const phone = normalizePhone(payload.phone ?? "");
  const location = toText(payload.location);
  const notes = toText(payload.notes);
  const targetRoles = parseTargetRoles(payload.target_roles);
  const consentVoice = payload.consent_voice === true;
  const consentMarketing = payload.consent_marketing === true;

  if (!phone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  if (!consentVoice) {
    return NextResponse.json(
      { error: "Voice consent is required before we can schedule qualification calls." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const existingLeadId = await findExistingLead(email, phone);
  let leadId = existingLeadId;

  if (existingLeadId) {
    await supabaseServer
      .from("lead_intake_submissions")
      .update({
        full_name: fullName ?? undefined,
        email: email ?? undefined,
        phone,
        location: location ?? undefined,
        target_roles: targetRoles,
        notes: notes ?? undefined,
        consent_voice: true,
        consent_marketing: consentMarketing,
        metadata: {
          last_source: toText(payload.source) ?? "marketing_form",
          updated_via: "marketing_form",
        },
        status: "new",
        next_call_due_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", existingLeadId);
  } else {
    const { data: lead, error: leadError } = await supabaseServer
      .from("lead_intake_submissions")
      .insert({
        source: "marketing_form",
        status: "new",
        full_name: fullName,
        email,
        phone,
        location,
        target_roles: targetRoles,
        notes,
        consent_voice: true,
        consent_marketing: consentMarketing,
        metadata: {
          submitted_via: "marketing_form",
          source: toText(payload.source) ?? "website",
        },
        next_call_due_at: nowIso,
      })
      .select("id")
      .single();

    if (leadError || !lead?.id) {
      return NextResponse.json({ error: "Failed to submit lead." }, { status: 500 });
    }
    leadId = lead.id as string;
  }

  if (!leadId) {
    return NextResponse.json({ error: "Lead submission could not be created." }, { status: 500 });
  }

  let voiceCallId: string | null = null;
  const playbook = await loadLeadQualificationPlaybook();
  if (playbook) {
    const task =
      String(playbook.assistant_goal ?? "").trim() ||
      String(playbook.system_prompt ?? "").trim();

    if (task) {
      const { data: voiceCall } = await supabaseServer
        .from("voice_calls")
        .insert({
          provider: "bland",
          direction: "outbound",
          call_type: "lead_qualification",
          status: "queued",
          lead_submission_id: leadId,
          playbook_id: playbook.id,
          from_number: process.env.BLAND_DEFAULT_FROM_NUMBER ?? null,
          to_number: phone,
          contact_name: fullName,
          task,
          max_retries: playbook.max_retry_attempts ?? 3,
          request_payload: {
            dispatch_source: "marketing_form",
          },
          response_payload: {},
        })
        .select("id")
        .single();

      voiceCallId = (voiceCall?.id as string | undefined) ?? null;

      if (voiceCallId) {
        await enqueueBackgroundJob(
          "VOICE_DISPATCH",
          {
            voice_call_id: voiceCallId,
            lead_submission_id: leadId,
            call_type: "lead_qualification",
          },
          { maxAttempts: 1 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    lead_id: leadId,
    voice_call_id: voiceCallId,
  });
}
