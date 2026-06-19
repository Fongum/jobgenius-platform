import { supabaseAdmin } from "@/lib/auth";
import { isAdminRole, isPeopleManagerRole } from "@/lib/auth/roles";
import {
  buildClientDeliveryBoardSummary,
  compareClientDeliverySnapshots,
  type ClientDeliveryActionType,
  type ClientDeliveryCaseBundle,
  type ClientDeliveryBlockerRecord,
  type ClientDeliveryBlockerStatus,
  type ClientDeliveryBlockerType,
  type ClientDeliveryBoardSummary,
  type ClientDeliveryCaseRecord,
  type ClientDeliveryRiskLevel,
  type ClientDeliverySnapshotRecord,
  type ClientDeliveryStage,
} from "@/lib/client-delivery";

type DeliverySnapshotRow = {
  case_id: string | null;
  job_seeker_id: string;
  account_manager_id: string | null;
  full_name: string | null;
  email: string | null;
  location: string | null;
  seniority: string | null;
  target_titles: string[] | null;
  intake_status: string | null;
  work_started: boolean | null;
  payment_status: string | null;
  amount_paid: number | string | null;
  total_amount: number | string | null;
  payment_deadline: string | null;
  system_stage: ClientDeliveryStage;
  effective_stage: ClientDeliveryStage;
  stage_override: ClientDeliveryStage | null;
  risk_level: ClientDeliveryRiskLevel;
  paused: boolean | null;
  last_application_at: string | null;
  applications_7d: number | null;
  applications_30d: number | null;
  open_application_runs: number | null;
  open_queue_count: number | null;
  last_outreach_at: string | null;
  next_follow_up_at: string | null;
  active_thread_count: number | null;
  follow_ups_due_count: number | null;
  next_interview_at: string | null;
  open_interview_count: number | null;
  prep_count: number | null;
  last_offer_at: string | null;
  has_open_offer: boolean | null;
  has_placed_offer: boolean | null;
  next_start_date: string | null;
  has_payment_hold: boolean | null;
  has_active_escalation: boolean | null;
  active_blocker_count: number | null;
  active_blocker_titles: string[] | null;
  next_action_type: ClientDeliveryActionType | null;
  next_action_title: string | null;
  next_action_notes: string | null;
  next_action_due_at: string | null;
  next_action_completed_at: string | null;
  next_action_completed_by: string | null;
  manager_notes: string | null;
  last_manual_review_at: string | null;
  overdue_next_action: boolean | null;
  last_touch_at: string;
  days_since_last_touch: number | null;
  needs_attention: boolean | null;
  case_created_at: string | null;
  case_updated_at: string | null;
};

type ClientDeliveryCaseRow = {
  id: string;
  job_seeker_id: string;
  account_manager_id: string | null;
  stage_override: ClientDeliveryStage | null;
  risk_level: ClientDeliveryRiskLevel;
  paused: boolean;
  next_action_type: ClientDeliveryActionType | null;
  next_action_title: string | null;
  next_action_notes: string | null;
  next_action_due_at: string | null;
  next_action_completed_at: string | null;
  next_action_completed_by: string | null;
  manager_notes: string | null;
  last_manual_review_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ClientDeliveryBlockerRow = {
  id: string;
  case_id: string;
  blocker_type: ClientDeliveryBlockerType;
  status: ClientDeliveryBlockerStatus;
  title: string;
  description: string | null;
  owner_account_manager_id: string | null;
  due_at: string | null;
  escalated: boolean | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type AccountManagerRoleRow = {
  role: string | null;
};

export type ClientDeliveryViewer = {
  accountManagerId: string;
  role?: string | null;
};

export type ClientDeliveryListFilters = {
  effectiveStages?: ClientDeliveryStage[];
  riskLevels?: ClientDeliveryRiskLevel[];
  needsAttentionOnly?: boolean;
  search?: string;
};

export type ClientDeliveryBoardResult = {
  rows: ClientDeliverySnapshotRecord[];
  summary: ClientDeliveryBoardSummary;
};

export type SaveClientDeliveryCaseInput = {
  jobSeekerId: string;
  actorAccountManagerId: string;
  riskLevel?: ClientDeliveryRiskLevel;
  paused?: boolean;
  stageOverride?: ClientDeliveryStage | null;
  nextActionType?: ClientDeliveryActionType | null;
  nextActionTitle?: string | null;
  nextActionNotes?: string | null;
  nextActionDueAt?: string | null;
  managerNotes?: string | null;
  completeNextAction?: boolean;
};

export type CreateClientDeliveryBlockerInput = {
  jobSeekerId: string;
  actorAccountManagerId: string;
  blockerType: ClientDeliveryBlockerType;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  ownerAccountManagerId?: string | null;
  escalated?: boolean;
};

export type UpdateClientDeliveryBlockerInput = {
  blockerId: string;
  status?: ClientDeliveryBlockerStatus;
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  escalated?: boolean;
  actorAccountManagerId: string;
};

const SNAPSHOT_SELECT = [
  "case_id",
  "job_seeker_id",
  "account_manager_id",
  "full_name",
  "email",
  "location",
  "seniority",
  "target_titles",
  "intake_status",
  "work_started",
  "payment_status",
  "amount_paid",
  "total_amount",
  "payment_deadline",
  "system_stage",
  "effective_stage",
  "stage_override",
  "risk_level",
  "paused",
  "last_application_at",
  "applications_7d",
  "applications_30d",
  "open_application_runs",
  "open_queue_count",
  "last_outreach_at",
  "next_follow_up_at",
  "active_thread_count",
  "follow_ups_due_count",
  "next_interview_at",
  "open_interview_count",
  "prep_count",
  "last_offer_at",
  "has_open_offer",
  "has_placed_offer",
  "next_start_date",
  "has_payment_hold",
  "has_active_escalation",
  "active_blocker_count",
  "active_blocker_titles",
  "next_action_type",
  "next_action_title",
  "next_action_notes",
  "next_action_due_at",
  "next_action_completed_at",
  "next_action_completed_by",
  "manager_notes",
  "last_manual_review_at",
  "overdue_next_action",
  "last_touch_at",
  "days_since_last_touch",
  "needs_attention",
  "case_created_at",
  "case_updated_at",
].join(", ");

const CASE_SELECT = [
  "id",
  "job_seeker_id",
  "account_manager_id",
  "stage_override",
  "risk_level",
  "paused",
  "next_action_type",
  "next_action_title",
  "next_action_notes",
  "next_action_due_at",
  "next_action_completed_at",
  "next_action_completed_by",
  "manager_notes",
  "last_manual_review_at",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

const BLOCKER_SELECT = [
  "id",
  "case_id",
  "blocker_type",
  "status",
  "title",
  "description",
  "owner_account_manager_id",
  "due_at",
  "escalated",
  "resolved_at",
  "resolved_by",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

export class ClientDeliveryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeArray(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function normalizeNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCount(value: number | null | undefined): number {
  return Number.isFinite(value ?? NaN) ? Number(value) : 0;
}

function mapSnapshotRow(row: DeliverySnapshotRow): ClientDeliverySnapshotRecord {
  return {
    caseId: row.case_id,
    jobSeekerId: row.job_seeker_id,
    accountManagerId: row.account_manager_id,
    fullName: row.full_name ?? "Unknown job seeker",
    email: row.email ?? "",
    location: row.location ?? "",
    seniority: row.seniority ?? "",
    targetTitles: normalizeArray(row.target_titles),
    intakeStatus: row.intake_status ?? "",
    workStarted: Boolean(row.work_started),
    paymentStatus: row.payment_status ?? "",
    amountPaid: normalizeNumber(row.amount_paid),
    totalAmount: normalizeNumber(row.total_amount),
    paymentDeadline: row.payment_deadline,
    systemStage: row.system_stage,
    effectiveStage: row.effective_stage,
    stageOverride: row.stage_override,
    riskLevel: row.risk_level,
    paused: Boolean(row.paused),
    lastApplicationAt: row.last_application_at,
    applications7d: normalizeCount(row.applications_7d),
    applications30d: normalizeCount(row.applications_30d),
    openApplicationRuns: normalizeCount(row.open_application_runs),
    openQueueCount: normalizeCount(row.open_queue_count),
    lastOutreachAt: row.last_outreach_at,
    nextFollowUpAt: row.next_follow_up_at,
    activeThreadCount: normalizeCount(row.active_thread_count),
    followUpsDueCount: normalizeCount(row.follow_ups_due_count),
    nextInterviewAt: row.next_interview_at,
    openInterviewCount: normalizeCount(row.open_interview_count),
    prepCount: normalizeCount(row.prep_count),
    lastOfferAt: row.last_offer_at,
    hasOpenOffer: Boolean(row.has_open_offer),
    hasPlacedOffer: Boolean(row.has_placed_offer),
    nextStartDate: row.next_start_date,
    hasPaymentHold: Boolean(row.has_payment_hold),
    hasActiveEscalation: Boolean(row.has_active_escalation),
    activeBlockerCount: normalizeCount(row.active_blocker_count),
    activeBlockerTitles: normalizeArray(row.active_blocker_titles),
    nextActionType: row.next_action_type,
    nextActionTitle: row.next_action_title ?? "",
    nextActionNotes: row.next_action_notes ?? "",
    nextActionDueAt: row.next_action_due_at,
    nextActionCompletedAt: row.next_action_completed_at,
    nextActionCompletedBy: row.next_action_completed_by,
    managerNotes: row.manager_notes ?? "",
    lastManualReviewAt: row.last_manual_review_at,
    overdueNextAction: Boolean(row.overdue_next_action),
    lastTouchAt: row.last_touch_at,
    daysSinceLastTouch: normalizeCount(row.days_since_last_touch),
    needsAttention: Boolean(row.needs_attention),
    caseCreatedAt: row.case_created_at,
    caseUpdatedAt: row.case_updated_at,
  };
}

function mapCaseRow(row: ClientDeliveryCaseRow): ClientDeliveryCaseRecord {
  return {
    id: row.id,
    jobSeekerId: row.job_seeker_id,
    accountManagerId: row.account_manager_id,
    stageOverride: row.stage_override,
    riskLevel: row.risk_level,
    paused: row.paused,
    nextActionType: row.next_action_type,
    nextActionTitle: row.next_action_title ?? "",
    nextActionNotes: row.next_action_notes ?? "",
    nextActionDueAt: row.next_action_due_at,
    nextActionCompletedAt: row.next_action_completed_at,
    nextActionCompletedBy: row.next_action_completed_by,
    managerNotes: row.manager_notes ?? "",
    lastManualReviewAt: row.last_manual_review_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBlockerRow(row: ClientDeliveryBlockerRow): ClientDeliveryBlockerRecord {
  return {
    id: row.id,
    caseId: row.case_id,
    blockerType: row.blocker_type,
    status: row.status,
    title: row.title,
    description: row.description ?? "",
    ownerAccountManagerId: row.owner_account_manager_id,
    dueAt: row.due_at,
    escalated: Boolean(row.escalated),
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveViewerRole(viewer: ClientDeliveryViewer): Promise<string | null> {
  if (viewer.role !== undefined) return viewer.role;

  const { data, error } = await supabaseAdmin
    .from("account_managers")
    .select("role")
    .eq("id", viewer.accountManagerId)
    .maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return (data as AccountManagerRoleRow | null)?.role ?? null;
}

function canViewAllDelivery(role: string | null | undefined): boolean {
  return isPeopleManagerRole(role) || isAdminRole(role);
}

function normalizeOptionalText(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalIsoTimestamp(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ClientDeliveryError(400, "Invalid date value.");
  }
  return parsed.toISOString();
}

function matchesSearch(row: ClientDeliverySnapshotRecord, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  return (
    row.fullName.toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle) ||
    row.location.toLowerCase().includes(needle) ||
    row.targetTitles.some((title) => title.toLowerCase().includes(needle))
  );
}

function applySnapshotFilters(
  rows: ClientDeliverySnapshotRecord[],
  filters: ClientDeliveryListFilters
): ClientDeliverySnapshotRecord[] {
  return rows.filter((row) => {
    if (filters.needsAttentionOnly && !row.needsAttention) {
      return false;
    }

    if (
      filters.effectiveStages?.length &&
      !filters.effectiveStages.includes(row.effectiveStage)
    ) {
      return false;
    }

    if (
      filters.riskLevels?.length &&
      !filters.riskLevels.includes(row.riskLevel)
    ) {
      return false;
    }

    if (filters.search && !matchesSearch(row, filters.search)) {
      return false;
    }

  return true;
  });
}

async function getLatestAssignedAccountManagerIdForSeeker(
  jobSeekerId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("account_manager_id")
    .eq("job_seeker_id", jobSeekerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return (data as { account_manager_id: string | null } | null)
    ?.account_manager_id ?? null;
}

async function upsertClientDeliveryCaseForSeeker(args: {
  jobSeekerId: string;
  actorAccountManagerId: string;
}): Promise<ClientDeliveryCaseRecord> {
  const existing = await getClientDeliveryCaseForSeeker(args.jobSeekerId);
  if (existing) return existing;

  const assignedAccountManagerId =
    await getLatestAssignedAccountManagerIdForSeeker(args.jobSeekerId);

  const { data, error } = await supabaseAdmin
    .from("client_delivery_cases")
    .upsert(
      {
        job_seeker_id: args.jobSeekerId,
        account_manager_id:
          assignedAccountManagerId ?? args.actorAccountManagerId,
        created_by: args.actorAccountManagerId,
      },
      { onConflict: "job_seeker_id" }
    )
    .select(CASE_SELECT)
    .single();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return mapCaseRow(data as unknown as ClientDeliveryCaseRow);
}

export async function ensureClientDeliveryCasesForManagedSeekers(
  limit = 500
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("v_client_delivery_snapshot")
    .select("job_seeker_id, account_manager_id, case_id")
    .is("case_id", null)
    .limit(limit);

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const rows =
    ((data as unknown as Array<{
      job_seeker_id: string;
      account_manager_id: string | null;
      case_id: string | null;
    }> | null) ?? []).filter((row) => !row.case_id);

  if (rows.length === 0) return 0;

  const payload = rows.map((row) => ({
    job_seeker_id: row.job_seeker_id,
    account_manager_id: row.account_manager_id,
  }));

  const { error: upsertError } = await supabaseAdmin
    .from("client_delivery_cases")
    .upsert(payload, { onConflict: "job_seeker_id" });

  if (upsertError) {
    throw new ClientDeliveryError(500, upsertError.message);
  }

  return payload.length;
}

export async function ensureClientDeliveryCaseForSeeker(
  jobSeekerId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("v_client_delivery_snapshot")
    .select("case_id, job_seeker_id, account_manager_id")
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const row =
    (data as
      | {
          case_id: string | null;
          job_seeker_id: string;
          account_manager_id: string | null;
        }
      | null) ?? null;

  if (!row) return null;
  if (row.case_id) return row.case_id;

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("client_delivery_cases")
    .upsert(
      {
        job_seeker_id: row.job_seeker_id,
        account_manager_id: row.account_manager_id,
      },
      { onConflict: "job_seeker_id" }
    )
    .select("id")
    .single();

  if (upsertError) {
    throw new ClientDeliveryError(500, upsertError.message);
  }

  return (upserted as { id: string } | null)?.id ?? null;
}

export async function listClientDeliverySnapshots(
  viewer: ClientDeliveryViewer,
  filters: ClientDeliveryListFilters = {}
): Promise<ClientDeliveryBoardResult> {
  await ensureClientDeliveryCasesForManagedSeekers();

  const role = await resolveViewerRole(viewer);
  let query = supabaseAdmin
    .from("v_client_delivery_snapshot")
    .select(SNAPSHOT_SELECT);

  if (!canViewAllDelivery(role)) {
    query = query.eq("account_manager_id", viewer.accountManagerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const rows = ((data as unknown as DeliverySnapshotRow[] | null) ?? []).map(
    mapSnapshotRow
  );
  const filteredRows = applySnapshotFilters(rows, filters).sort(
    compareClientDeliverySnapshots
  );

  return {
    rows: filteredRows,
    summary: buildClientDeliveryBoardSummary(filteredRows),
  };
}

export async function getClientDeliverySnapshotForSeeker(
  viewer: ClientDeliveryViewer,
  jobSeekerId: string
): Promise<ClientDeliverySnapshotRecord | null> {
  await ensureClientDeliveryCaseForSeeker(jobSeekerId);

  const role = await resolveViewerRole(viewer);
  let query = supabaseAdmin
    .from("v_client_delivery_snapshot")
    .select(SNAPSHOT_SELECT)
    .eq("job_seeker_id", jobSeekerId);

  if (!canViewAllDelivery(role)) {
    query = query.eq("account_manager_id", viewer.accountManagerId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const row = (data as unknown as DeliverySnapshotRow | null) ?? null;
  return row ? mapSnapshotRow(row) : null;
}

export async function getClientDeliveryCaseForSeeker(
  jobSeekerId: string
): Promise<ClientDeliveryCaseRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("client_delivery_cases")
    .select(CASE_SELECT)
    .eq("job_seeker_id", jobSeekerId)
    .maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const row = (data as unknown as ClientDeliveryCaseRow | null) ?? null;
  return row ? mapCaseRow(row) : null;
}

export async function saveClientDeliveryCase(
  input: SaveClientDeliveryCaseInput
): Promise<ClientDeliveryCaseRecord> {
  const caseRecord = await upsertClientDeliveryCaseForSeeker({
    jobSeekerId: input.jobSeekerId,
    actorAccountManagerId: input.actorAccountManagerId,
  });

  const assignedAccountManagerId =
    caseRecord.accountManagerId ??
    (await getLatestAssignedAccountManagerIdForSeeker(input.jobSeekerId)) ??
    input.actorAccountManagerId;

  const updates: Record<string, unknown> = {
    last_manual_review_at: new Date().toISOString(),
  };

  if (assignedAccountManagerId && !caseRecord.accountManagerId) {
    updates.account_manager_id = assignedAccountManagerId;
  }

  if (input.riskLevel !== undefined) {
    updates.risk_level = input.riskLevel;
  }

  if (input.paused !== undefined) {
    updates.paused = input.paused;
  }

  if (input.stageOverride !== undefined) {
    updates.stage_override = input.stageOverride;
  }

  if (input.managerNotes !== undefined) {
    updates.manager_notes = normalizeOptionalText(input.managerNotes);
  }

  const nextActionType =
    input.nextActionType === undefined
      ? undefined
      : input.nextActionType ?? null;
  const nextActionTitle = normalizeOptionalText(input.nextActionTitle);
  const nextActionNotes = normalizeOptionalText(input.nextActionNotes);
  const nextActionDueAt = normalizeOptionalIsoTimestamp(input.nextActionDueAt);

  const nextActionTouched =
    input.nextActionType !== undefined ||
    input.nextActionTitle !== undefined ||
    input.nextActionNotes !== undefined ||
    input.nextActionDueAt !== undefined;

  if (input.nextActionType !== undefined) {
    updates.next_action_type = nextActionType;
  }
  if (input.nextActionTitle !== undefined) {
    updates.next_action_title = nextActionTitle;
  }
  if (input.nextActionNotes !== undefined) {
    updates.next_action_notes = nextActionNotes;
  }
  if (input.nextActionDueAt !== undefined) {
    updates.next_action_due_at = nextActionDueAt;
  }

  if (input.completeNextAction) {
    const completedAt = new Date().toISOString();
    updates.next_action_completed_at = completedAt;
    updates.next_action_completed_by = input.actorAccountManagerId;
  } else if (nextActionTouched) {
    updates.next_action_completed_at = null;
    updates.next_action_completed_by = null;
  }

  const { data, error } = await supabaseAdmin
    .from("client_delivery_cases")
    .update(updates)
    .eq("id", caseRecord.id)
    .select(CASE_SELECT)
    .single();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return mapCaseRow(data as unknown as ClientDeliveryCaseRow);
}

export async function getClientDeliveryBlockerContext(
  blockerId: string
): Promise<{ blocker: ClientDeliveryBlockerRecord; jobSeekerId: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("client_delivery_blockers")
    .select(BLOCKER_SELECT)
    .eq("id", blockerId)
    .maybeSingle();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  const blockerRow = (data as unknown as ClientDeliveryBlockerRow | null) ?? null;
  if (!blockerRow) return null;

  const { data: caseData, error: caseError } = await supabaseAdmin
    .from("client_delivery_cases")
    .select("job_seeker_id")
    .eq("id", blockerRow.case_id)
    .maybeSingle();

  if (caseError) {
    throw new ClientDeliveryError(500, caseError.message);
  }

  const jobSeekerId =
    (caseData as { job_seeker_id: string } | null)?.job_seeker_id ?? null;

  if (!jobSeekerId) return null;

  return {
    blocker: mapBlockerRow(blockerRow),
    jobSeekerId,
  };
}

export async function createClientDeliveryBlocker(
  input: CreateClientDeliveryBlockerInput
): Promise<ClientDeliveryBlockerRecord> {
  const caseRecord = await upsertClientDeliveryCaseForSeeker({
    jobSeekerId: input.jobSeekerId,
    actorAccountManagerId: input.actorAccountManagerId,
  });

  const { data, error } = await supabaseAdmin
    .from("client_delivery_blockers")
    .insert({
      case_id: caseRecord.id,
      blocker_type: input.blockerType,
      status: "active",
      title: input.title.trim(),
      description: normalizeOptionalText(input.description) ?? null,
      owner_account_manager_id:
        input.ownerAccountManagerId ?? caseRecord.accountManagerId,
      due_at: normalizeOptionalIsoTimestamp(input.dueAt) ?? null,
      escalated: Boolean(input.escalated),
      created_by: input.actorAccountManagerId,
    })
    .select(BLOCKER_SELECT)
    .single();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return mapBlockerRow(data as unknown as ClientDeliveryBlockerRow);
}

export async function updateClientDeliveryBlocker(
  input: UpdateClientDeliveryBlockerInput
): Promise<ClientDeliveryBlockerRecord> {
  const existing = await getClientDeliveryBlockerContext(input.blockerId);
  if (!existing) {
    throw new ClientDeliveryError(404, "Blocker not found.");
  }

  const updates: Record<string, unknown> = {};

  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === "resolved" || input.status === "escalated") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = input.actorAccountManagerId;
    } else if (input.status === "active") {
      updates.resolved_at = null;
      updates.resolved_by = null;
    }
  }

  if (input.title !== undefined) {
    updates.title = input.title.trim();
  }

  if (input.description !== undefined) {
    updates.description = normalizeOptionalText(input.description) ?? null;
  }

  if (input.dueAt !== undefined) {
    updates.due_at = normalizeOptionalIsoTimestamp(input.dueAt) ?? null;
  }

  if (input.escalated !== undefined) {
    updates.escalated = input.escalated;
  }

  const { data, error } = await supabaseAdmin
    .from("client_delivery_blockers")
    .update(updates)
    .eq("id", input.blockerId)
    .select(BLOCKER_SELECT)
    .single();

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return mapBlockerRow(data as unknown as ClientDeliveryBlockerRow);
}

export async function listClientDeliveryBlockersForSeeker(
  jobSeekerId: string,
  options: { activeOnly?: boolean } = {}
): Promise<ClientDeliveryBlockerRecord[]> {
  const caseRecord = await getClientDeliveryCaseForSeeker(jobSeekerId);
  if (!caseRecord) return [];

  let query = supabaseAdmin
    .from("client_delivery_blockers")
    .select(BLOCKER_SELECT)
    .eq("case_id", caseRecord.id)
    .order("created_at", { ascending: false });

  if (options.activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    throw new ClientDeliveryError(500, error.message);
  }

  return ((data as unknown as ClientDeliveryBlockerRow[] | null) ?? []).map(
    mapBlockerRow
  );
}

export async function getClientDeliveryCaseBundleForSeeker(
  viewer: ClientDeliveryViewer,
  jobSeekerId: string
): Promise<ClientDeliveryCaseBundle> {
  const [snapshot, caseRecord, blockers] = await Promise.all([
    getClientDeliverySnapshotForSeeker(viewer, jobSeekerId),
    getClientDeliveryCaseForSeeker(jobSeekerId),
    listClientDeliveryBlockersForSeeker(jobSeekerId),
  ]);

  return {
    snapshot,
    caseRecord,
    blockers,
  };
}
