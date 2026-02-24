import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { normalizePhone } from "@/lib/voice/service";

type ImportPayload = {
  file_name?: string;
  source?: string;
  rows?: Array<Record<string, unknown>>;
  default_call_type?: string;
};

type ParsedLeadRow = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  targetRoles: string[];
  notes: string | null;
  consentVoice: boolean;
  consentMarketing: boolean;
  metadata: Record<string, unknown>;
};

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function parseList(value: unknown): string[] {
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

function parseLeadRow(input: Record<string, unknown>): ParsedLeadRow {
  const fullName = toText(input.full_name) ?? toText(input.name);
  const email = toText(input.email)?.toLowerCase() ?? null;
  const phone = normalizePhone(
    toText(input.phone) ??
      toText(input.mobile) ??
      toText(input.phone_number) ??
      ""
  );
  const location = toText(input.location) ?? toText(input.city);
  const targetRoles = parseList(input.target_roles ?? input.roles ?? input.titles);
  const notes = toText(input.notes) ?? toText(input.note);
  const consentVoice = toBoolean(input.consent_voice ?? input.voice_opt_in, true);
  const consentMarketing = toBoolean(
    input.consent_marketing ?? input.marketing_opt_in,
    false
  );

  return {
    fullName,
    email,
    phone: phone || null,
    location,
    targetRoles,
    notes,
    consentVoice,
    consentMarketing,
    metadata: input,
  };
}

async function findDuplicateLead(email: string | null, phone: string | null) {
  if (email) {
    const { data: byEmail } = await supabaseAdmin
      .from("lead_intake_submissions")
      .select("id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (byEmail?.id) return byEmail.id as string;
  }

  if (phone) {
    const { data: byPhone } = await supabaseAdmin
      .from("lead_intake_submissions")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (byPhone?.id) return byPhone.id as string;
  }

  return null;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: ImportPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array." }, { status: 400 });
  }

  const fileName = toText(payload.file_name) ?? `lead-import-${new Date().toISOString()}.json`;
  const source = toText(payload.source) ?? "excel_import";
  const nowIso = new Date().toISOString();

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("lead_import_batches")
    .insert({
      file_name: fileName,
      source,
      status: "processing",
      total_rows: rows.length,
      uploaded_by_am_id: auth.user.id,
      metadata: {
        default_call_type: payload.default_call_type ?? "lead_qualification",
      },
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (batchError || !batch?.id) {
    return NextResponse.json({ error: "Failed to create import batch." }, { status: 500 });
  }

  let insertedRows = 0;
  let errorRows = 0;
  const details: Array<{ row_number: number; status: string; reason?: string; lead_id?: string }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i];
    const rowNumber = i + 1;
    const parsed = parseLeadRow(raw);
    let rowStatus: "inserted" | "duplicate" | "invalid" | "error" = "inserted";
    let errorDetail: string | null = null;
    let leadId: string | null = null;

    if (!parsed.phone) {
      rowStatus = "invalid";
      errorDetail = "Phone number is required for voice qualification calls.";
      errorRows += 1;
    } else {
      const duplicateId = await findDuplicateLead(parsed.email, parsed.phone);
      if (duplicateId) {
        rowStatus = "duplicate";
        leadId = duplicateId;
      } else {
        const { data: lead, error: leadError } = await supabaseAdmin
          .from("lead_intake_submissions")
          .insert({
            source: "excel_import",
            status: "new",
            full_name: parsed.fullName,
            email: parsed.email,
            phone: parsed.phone,
            location: parsed.location,
            target_roles: parsed.targetRoles,
            notes: parsed.notes,
            consent_voice: parsed.consentVoice,
            consent_marketing: parsed.consentMarketing,
            metadata: parsed.metadata,
            imported_batch_id: batch.id,
            imported_row_number: rowNumber,
            owner_account_manager_id: auth.user.id,
            next_call_due_at: nowIso,
          })
          .select("id")
          .single();

        if (leadError || !lead?.id) {
          rowStatus = "error";
          errorDetail = "Failed to create lead submission.";
          errorRows += 1;
        } else {
          insertedRows += 1;
          leadId = lead.id as string;
        }
      }
    }

    await supabaseAdmin.from("lead_import_rows").insert({
      batch_id: batch.id,
      row_number: rowNumber,
      raw_data: raw,
      normalized_email: parsed.email,
      normalized_phone: parsed.phone,
      status: rowStatus,
      error_detail: errorDetail,
      lead_submission_id: leadId,
    });

    details.push({
      row_number: rowNumber,
      status: rowStatus,
      reason: errorDetail ?? undefined,
      lead_id: leadId ?? undefined,
    });
  }

  await supabaseAdmin
    .from("lead_import_batches")
    .update({
      status: "completed",
      inserted_rows: insertedRows,
      error_rows: errorRows,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batch.id);

  return NextResponse.json({
    ok: true,
    batch_id: batch.id,
    total_rows: rows.length,
    inserted_rows: insertedRows,
    error_rows: errorRows,
    details,
  });
}
