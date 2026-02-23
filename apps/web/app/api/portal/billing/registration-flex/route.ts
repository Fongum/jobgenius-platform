import { NextResponse } from "next/server";
import { requireJobSeeker, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";

const DEFAULT_MAX_INSTALLMENTS = 3;
const DEFAULT_WINDOW_DAYS = 31;
const FLEX_MAX_INSTALLMENTS = 12;
const FLEX_MAX_WINDOW_DAYS = 365;

type RequestPayload = {
  requested_installment_count?: number;
  requested_window_days?: number;
  requested_note?: string;
};

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const intValue = Math.trunc(value);
  return intValue > 0 ? intValue : null;
}

export async function GET(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: flexRequest, error } = await supabaseAdmin
    .from("registration_flex_requests")
    .select("*")
    .eq("job_seeker_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load flexible registration request." },
      { status: 500 }
    );
  }

  return NextResponse.json({ request: flexRequest ?? null });
}

export async function POST(request: Request) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: RequestPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestedInstallmentCount = toPositiveInt(
    body.requested_installment_count
  );
  const requestedWindowDays = toPositiveInt(body.requested_window_days);
  const requestedNote =
    typeof body.requested_note === "string" ? body.requested_note.trim() : "";

  if (!requestedNote || requestedNote.length < 15) {
    return NextResponse.json(
      { error: "Please provide at least 15 characters explaining the request." },
      { status: 400 }
    );
  }

  if (
    requestedInstallmentCount !== null &&
    (requestedInstallmentCount < 1 ||
      requestedInstallmentCount > FLEX_MAX_INSTALLMENTS)
  ) {
    return NextResponse.json(
      {
        error: `Requested installment count must be between 1 and ${FLEX_MAX_INSTALLMENTS}.`,
      },
      { status: 400 }
    );
  }

  if (
    requestedWindowDays !== null &&
    (requestedWindowDays < 7 || requestedWindowDays > FLEX_MAX_WINDOW_DAYS)
  ) {
    return NextResponse.json(
      {
        error: `Requested payment window must be between 7 and ${FLEX_MAX_WINDOW_DAYS} days.`,
      },
      { status: 400 }
    );
  }

  if (
    (requestedInstallmentCount ?? DEFAULT_MAX_INSTALLMENTS) <=
      DEFAULT_MAX_INSTALLMENTS &&
    (requestedWindowDays ?? DEFAULT_WINDOW_DAYS) <= DEFAULT_WINDOW_DAYS
  ) {
    return NextResponse.json(
      {
        error:
          "Your request must exceed the default registration terms (up to 3 installments within 31 days).",
      },
      { status: 400 }
    );
  }

  const [{ data: existingPending, error: pendingError }, { data: contract }] =
    await Promise.all([
      supabaseAdmin
        .from("registration_flex_requests")
        .select("id")
        .eq("job_seeker_id", auth.user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("job_seeker_contracts")
        .select("id")
        .eq("job_seeker_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (pendingError) {
    return NextResponse.json(
      { error: "Failed to check current request status." },
      { status: 500 }
    );
  }

  if (existingPending) {
    return NextResponse.json(
      { error: "You already have a pending flexible registration request." },
      { status: 409 }
    );
  }

  if (!contract?.id) {
    return NextResponse.json(
      { error: "Please sign your contract first before requesting flexible registration terms." },
      { status: 400 }
    );
  }

  const { data: flexRequest, error } = await supabaseAdmin
    .from("registration_flex_requests")
    .insert({
      job_seeker_id: auth.user.id,
      contract_id: contract.id,
      requested_installment_count: requestedInstallmentCount,
      requested_window_days: requestedWindowDays,
      requested_note: requestedNote,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !flexRequest) {
    return NextResponse.json(
      { error: "Failed to submit flexible registration request." },
      { status: 500 }
    );
  }

  const [{ data: seeker }, { data: admins }] = await Promise.all([
    supabaseAdmin
      .from("job_seekers")
      .select("full_name, email")
      .eq("id", auth.user.id)
      .maybeSingle(),
    supabaseAdmin
      .from("account_managers")
      .select("email, name")
      .in("role", ["admin", "superadmin"]),
  ]);

  if (admins && admins.length > 0) {
    const seekerName = seeker?.full_name || auth.user.email;
    const requestedCountLabel =
      requestedInstallmentCount !== null
        ? `${requestedInstallmentCount}`
        : "not specified";
    const requestedWindowLabel =
      requestedWindowDays !== null ? `${requestedWindowDays}` : "not specified";

    await Promise.all(
      admins.map((admin) =>
        sendAndLogEmail({
          to: admin.email,
          subject: `Flexible registration request: ${seekerName}`,
          html: `
            <p>Hello ${admin.name ?? "Admin"},</p>
            <p><strong>${seekerName}</strong> requested a flexible registration payment plan.</p>
            <p>Requested installment count: <strong>${requestedCountLabel}</strong></p>
            <p>Requested payment window (days): <strong>${requestedWindowLabel}</strong></p>
            <p>Reason:</p>
            <blockquote style="border-left:3px solid #d1d5db;padding-left:12px;margin:8px 0;">${requestedNote}</blockquote>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing">Review in Billing Dashboard</a></p>
          `,
          job_seeker_id: auth.user.id,
          template_key: "billing-registration-flex-requested",
        }).catch(() => null)
      )
    );
  }

  return NextResponse.json({ ok: true, request: flexRequest }, { status: 201 });
}
