import { createHmac, timingSafeEqual } from "crypto";
import type { VoiceCallStatus } from "@/lib/voice/types";

type JsonRecord = Record<string, unknown>;

export type BlandOutboundCallInput = {
  toNumber: string;
  task: string;
  fromNumber?: string | null;
  pathwayId?: string | null;
  model?: string | null;
  voice?: string | null;
  webhookUrl?: string | null;
  webhookEvents?: string[];
  requestData?: JsonRecord;
  metadata?: JsonRecord;
};

export type BlandOutboundCallResult = {
  providerCallId: string | null;
  status: string | null;
  raw: JsonRecord;
};

export type NormalizedBlandWebhookEvent = {
  providerCallId: string | null;
  providerEventId: string | null;
  eventType: string;
  status: VoiceCallStatus | null;
  direction: "inbound" | "outbound" | null;
  fromNumber: string | null;
  toNumber: string | null;
  transcript: string | null;
  summary: string | null;
  disposition: string | null;
  payload: JsonRecord;
};

function toRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedString(record: JsonRecord, keys: string[]): string | null {
  let current: unknown = record;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonRecord)[key];
  }
  return readString(current);
}

function normalizeBlandUrl() {
  const baseUrl = process.env.BLAND_BASE_URL?.trim() || "https://api.bland.ai";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function extractCallId(payload: JsonRecord): string | null {
  return (
    readString(payload.call_id) ||
    readString(payload.id) ||
    readNestedString(payload, ["data", "call_id"]) ||
    readNestedString(payload, ["data", "id"]) ||
    readNestedString(payload, ["call", "call_id"]) ||
    readNestedString(payload, ["call", "id"]) ||
    null
  );
}

function inferStatus(eventType: string, explicitStatus: string | null): VoiceCallStatus | null {
  const normalized = `${explicitStatus ?? ""} ${eventType}`.toLowerCase();

  if (normalized.includes("opt_out") || normalized.includes("unsubscribe")) return "opted_out";
  if (normalized.includes("voicemail")) return "voicemail";
  if (normalized.includes("no_answer") || normalized.includes("no answer")) return "no_answer";
  if (normalized.includes("in-progress") || normalized.includes("in_progress")) return "in_progress";
  if (normalized.includes("ringing")) return "ringing";
  if (normalized.includes("initiated")) return "initiated";
  if (normalized.includes("analyzed") || normalized.includes("analysis_complete")) return "completed";
  if (normalized.includes("ended") || normalized.includes("completed")) return "ended";
  if (normalized.includes("failed") || normalized.includes("error")) return "failed";

  return null;
}

function parseDirection(payload: JsonRecord): "inbound" | "outbound" | null {
  const direction = (
    readString(payload.direction) ||
    readNestedString(payload, ["data", "direction"]) ||
    ""
  ).toLowerCase();
  if (direction === "inbound" || direction === "outbound") {
    return direction;
  }
  return null;
}

function parseSignatureCandidates(rawHeaderValue: string): string[] {
  const values = new Set<string>();
  const chunks = rawHeaderValue
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    values.add(chunk);
    if (chunk.startsWith("sha256=")) values.add(chunk.slice("sha256=".length));
    if (chunk.startsWith("v1=")) values.add(chunk.slice("v1=".length));
    if (chunk.includes("=")) {
      const [, rhs] = chunk.split("=", 2);
      if (rhs) values.add(rhs.trim());
    }
  }

  return Array.from(values).filter(Boolean);
}

function safeCompare(valueA: string, valueB: string): boolean {
  const a = Buffer.from(valueA);
  const b = Buffer.from(valueB);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyBlandWebhookSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.BLAND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return true;
  }

  const provided =
    headers.get("x-bland-signature") ||
    headers.get("bland-signature") ||
    headers.get("x-webhook-signature") ||
    "";
  if (!provided) {
    return false;
  }

  const digestHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const digestBase64 = createHmac("sha256", secret).update(rawBody).digest("base64");
  const candidates = parseSignatureCandidates(provided);

  return candidates.some(
    (candidate) =>
      safeCompare(candidate, digestHex) ||
      safeCompare(candidate, `sha256=${digestHex}`) ||
      safeCompare(candidate, digestBase64)
  );
}

export async function createBlandOutboundCall(
  input: BlandOutboundCallInput
): Promise<BlandOutboundCallResult> {
  const apiKey = process.env.BLAND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("BLAND_API_KEY is not configured.");
  }

  if (!input.toNumber.trim()) {
    throw new Error("toNumber is required.");
  }
  if (!input.task.trim()) {
    throw new Error("task is required.");
  }

  const body: JsonRecord = {
    phone_number: input.toNumber.trim(),
    to: input.toNumber.trim(),
    from: input.fromNumber ?? process.env.BLAND_DEFAULT_FROM_NUMBER ?? undefined,
    task: input.task.trim(),
    pathway_id: input.pathwayId ?? undefined,
    model: input.model ?? undefined,
    voice: input.voice ?? undefined,
    webhook: input.webhookUrl ?? undefined,
    webhook_events: input.webhookEvents ?? [
      "call.initiated",
      "call.ringing",
      "call.in-progress",
      "call.ended",
      "call.analyzed",
    ],
    request_data: input.requestData ?? {},
    metadata: input.metadata ?? {},
    answered_by_enabled: true,
  };

  const response = await fetch(`${normalizeBlandUrl()}/v1/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  let raw: JsonRecord = {};
  try {
    raw = toRecord(await response.json());
  } catch {
    raw = {};
  }

  if (!response.ok) {
    const message =
      readString(raw.error) ||
      readString(raw.message) ||
      `Bland call create failed with status ${response.status}`;
    throw new Error(message);
  }

  return {
    providerCallId: extractCallId(raw),
    status: readString(raw.status),
    raw,
  };
}

export function normalizeBlandWebhookPayload(payload: JsonRecord): NormalizedBlandWebhookEvent {
  const eventType =
    readString(payload.event) ||
    readString(payload.type) ||
    readNestedString(payload, ["data", "event"]) ||
    "call.unknown";

  const explicitStatus =
    readString(payload.status) ||
    readNestedString(payload, ["data", "status"]) ||
    readNestedString(payload, ["call", "status"]);

  const providerEventId =
    readString(payload.event_id) ||
    readString(payload.id) ||
    readNestedString(payload, ["data", "event_id"]) ||
    null;

  const transcript =
    readNestedString(payload, ["analysis", "transcript"]) ||
    readNestedString(payload, ["call", "transcript"]) ||
    readNestedString(payload, ["data", "transcript"]) ||
    null;

  const summary =
    readNestedString(payload, ["analysis", "summary"]) ||
    readNestedString(payload, ["call", "summary"]) ||
    readNestedString(payload, ["data", "summary"]) ||
    null;

  const disposition =
    readNestedString(payload, ["analysis", "disposition"]) ||
    readNestedString(payload, ["call", "disposition"]) ||
    readNestedString(payload, ["data", "disposition"]) ||
    null;

  return {
    providerCallId: extractCallId(payload),
    providerEventId,
    eventType,
    status: inferStatus(eventType, explicitStatus),
    direction: parseDirection(payload),
    fromNumber:
      readString(payload.from) ||
      readString(payload.from_number) ||
      readNestedString(payload, ["data", "from"]) ||
      readNestedString(payload, ["call", "from"]) ||
      null,
    toNumber:
      readString(payload.to) ||
      readString(payload.to_number) ||
      readNestedString(payload, ["data", "to"]) ||
      readNestedString(payload, ["call", "to"]) ||
      null,
    transcript,
    summary,
    disposition,
    payload,
  };
}
