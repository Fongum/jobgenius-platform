import { NextResponse } from "next/server";
import {
  normalizeBlandWebhookPayload,
  verifyBlandWebhookSignature,
} from "@/lib/voice/bland";
import { supabaseServer } from "@/lib/supabase/server";
import {
  appendVoiceConversationNote,
  evaluateEscalation,
  findJobSeekerByPhone,
  markUpsellOptOut,
  resolveAssignedAccountManagerId,
} from "@/lib/voice/service";
import { normalizeVoiceCallType, type VoiceCallType } from "@/lib/voice/types";

type JsonRecord = Record<string, unknown>;

type VoicePlaybookJoin = {
  id: string;
  escalation_rules: unknown;
};

type VoiceCallRow = {
  id: string;
  provider_call_id: string | null;
  call_type: string;
  status: string;
  direction: string;
  job_seeker_id: string | null;
  lead_submission_id: string | null;
  account_manager_id: string | null;
  from_number: string | null;
  to_number: string;
  playbook_id: string | null;
  call_started_at?: string | null;
  voice_playbooks: VoicePlaybookJoin | VoicePlaybookJoin[] | null;
};

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedString(record: JsonRecord, keys: string[]): string | null {
  let current: unknown = record;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as JsonRecord)[key];
  }
  return readString(current);
}

function normalizePlaybook(value: VoiceCallRow["voice_playbooks"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isTerminalStatus(status: string) {
  return [
    "completed",
    "failed",
    "no_answer",
    "voicemail",
    "opted_out",
    "escalated",
    "ended",
  ].includes(status);
}

function inferCallTypeFromPayload(payload: JsonRecord): VoiceCallType {
  const requestData = asRecord(payload.request_data ?? payload.data);
  const maybe =
    normalizeVoiceCallType(requestData.call_type) ||
    normalizeVoiceCallType(readNestedString(payload, ["request_data", "call_type"])) ||
    normalizeVoiceCallType(readNestedString(payload, ["data", "request_data", "call_type"])) ||
    null;

  return maybe ?? "check_in";
}

async function findActivePlaybookId(callType: VoiceCallType) {
  const { data } = await supabaseServer
    .from("voice_playbooks")
    .select("id")
    .eq("call_type", callType)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

async function findVoiceCallByProviderCallId(providerCallId: string) {
  const { data, error } = await supabaseServer
    .from("voice_calls")
    .select(`
      id,
      provider_call_id,
      call_type,
      status,
      direction,
      job_seeker_id,
      lead_submission_id,
      account_manager_id,
      from_number,
      to_number,
      playbook_id,
      call_started_at,
      voice_playbooks (
        id,
        escalation_rules
      )
    `)
    .eq("provider_call_id", providerCallId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as VoiceCallRow;
}

async function maybeCreateInboundVoiceCall(params: {
  providerCallId: string | null;
  direction: "inbound" | "outbound" | null;
  fromNumber: string | null;
  toNumber: string | null;
  callType: VoiceCallType;
  status: string;
}) {
  if (!params.providerCallId || params.direction !== "inbound") {
    return null;
  }

  const seeker = params.fromNumber ? await findJobSeekerByPhone(params.fromNumber) : null;
  const accountManagerId = seeker?.id
    ? await resolveAssignedAccountManagerId(seeker.id)
    : null;
  const playbookId = await findActivePlaybookId(params.callType);

  const { data, error } = await supabaseServer
    .from("voice_calls")
    .insert({
      provider: "bland",
      provider_call_id: params.providerCallId,
      direction: "inbound",
      call_type: params.callType,
      status: params.status,
      job_seeker_id: seeker?.id ?? null,
      account_manager_id: accountManagerId,
      playbook_id: playbookId,
      from_number: params.fromNumber,
      to_number: params.toNumber ?? params.fromNumber ?? "unknown",
      request_payload: {},
      response_payload: {},
    })
    .select(`
      id,
      provider_call_id,
      call_type,
      status,
      direction,
      job_seeker_id,
      lead_submission_id,
      account_manager_id,
      from_number,
      to_number,
      playbook_id,
      call_started_at,
      voice_playbooks (
        id,
        escalation_rules
      )
    `)
    .single();

  if (error || !data) {
    return null;
  }

  return data as unknown as VoiceCallRow;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyBlandWebhookSignature(rawBody, request.headers)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  let payload: JsonRecord;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const normalized = normalizeBlandWebhookPayload(payload);
  const fallbackStatus = normalized.status ?? "initiated";
  const callType = inferCallTypeFromPayload(payload);

  let voiceCall =
    normalized.providerCallId
      ? await findVoiceCallByProviderCallId(normalized.providerCallId)
      : null;

  if (!voiceCall) {
    voiceCall = await maybeCreateInboundVoiceCall({
      providerCallId: normalized.providerCallId,
      direction: normalized.direction,
      fromNumber: normalized.fromNumber,
      toNumber: normalized.toNumber,
      callType,
      status: fallbackStatus,
    });
  }

  await supabaseServer.from("voice_call_events").insert({
    voice_call_id: voiceCall?.id ?? null,
    provider: "bland",
    provider_call_id: normalized.providerCallId,
    provider_event_id: normalized.providerEventId,
    event_type: normalized.eventType,
    event_status: normalized.status,
    payload,
    received_at: new Date().toISOString(),
  });

  if (!voiceCall) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const playbook = normalizePlaybook(voiceCall.voice_playbooks);
  const normalizedCallType = normalizeVoiceCallType(voiceCall.call_type) ?? callType;
  const escalation = evaluateEscalation({
    callType: normalizedCallType,
    transcript: normalized.transcript,
    summary: normalized.summary,
    disposition: normalized.disposition,
    escalationRules: playbook?.escalation_rules,
  });

  const nowIso = new Date().toISOString();
  const newStatus = escalation.requiresEscalation
    ? "escalated"
    : (normalized.status ?? voiceCall.status ?? "initiated");
  const recordingUrl =
    readString(payload.recording_url) ||
    readNestedString(payload, ["analysis", "recording_url"]) ||
    null;

  await supabaseServer
    .from("voice_calls")
    .update({
      status: newStatus,
      summary: normalized.summary ?? undefined,
      disposition: normalized.disposition ?? undefined,
      transcript: normalized.transcript ?? undefined,
      recording_url: recordingUrl ?? undefined,
      requires_escalation: escalation.requiresEscalation,
      escalation_reason: escalation.reasons.join(", ") || null,
      response_payload: payload,
      call_started_at:
        voiceCall.call_started_at ?? (["initiated", "ringing", "in_progress"].includes(newStatus) ? nowIso : null),
      call_ended_at: isTerminalStatus(newStatus) ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("id", voiceCall.id);

  if (escalation.shouldMarkUpsellOptOut && normalized.fromNumber) {
    await markUpsellOptOut({
      phone: normalized.fromNumber,
      jobSeekerId: voiceCall.job_seeker_id,
      leadSubmissionId: voiceCall.lead_submission_id,
      reason: "User requested no upsell calls during voice conversation.",
      source: "bland_webhook",
      createdByAmId: voiceCall.account_manager_id,
    });
  }

  const shouldLogConversation =
    escalation.requiresEscalation ||
    Boolean(normalized.summary) ||
    Boolean(normalized.disposition) ||
    isTerminalStatus(newStatus);

  if (
    shouldLogConversation &&
    voiceCall.job_seeker_id &&
    voiceCall.account_manager_id
  ) {
    await appendVoiceConversationNote({
      jobSeekerId: voiceCall.job_seeker_id,
      accountManagerId: voiceCall.account_manager_id,
      callType: normalizedCallType,
      status: newStatus,
      summary: normalized.summary,
      disposition: normalized.disposition,
      escalationReason: escalation.reasons.join(", ") || null,
      recordingUrl,
      providerCallId: normalized.providerCallId,
    });
  }

  return NextResponse.json({ success: true });
}
