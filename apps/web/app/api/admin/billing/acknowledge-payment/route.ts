import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { sendAndLogEmail } from "@/lib/messaging/send-and-log";
import { logAdminAction } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { screenshotId, note } = body as { screenshotId: string; note?: string };

  if (!screenshotId) {
    return NextResponse.json({ error: "screenshotId is required." }, { status: 400 });
  }

  const { data: screenshot } = await supabaseAdmin
    .from("payment_screenshots")
    .select("*")
    .eq("id", screenshotId)
    .single();

  if (!screenshot) {
    return NextResponse.json({ error: "Screenshot not found." }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Acknowledge the screenshot
  const { error: ackError } = await supabaseAdmin
    .from("payment_screenshots")
    .update({
      acknowledged_at: now,
      acknowledged_by: auth.user.id,
      note: note ?? null,
    })
    .eq("id", screenshotId);

  if (ackError) {
    return NextResponse.json({ error: "Failed to acknowledge screenshot." }, { status: 500 });
  }

  // Update installment to paid if linked
  if (screenshot.installment_id) {
    const { error: installmentError } = await supabaseAdmin
      .from("payment_installments")
      .update({ status: "paid", paid_at: now })
      .eq("id", screenshot.installment_id);

    if (installmentError) {
      console.error("[billing] failed to update installment status:", installmentError);
    }

    // Recalculate amount_paid on registration_payment
    const { data: installments } = await supabaseAdmin
      .from("payment_installments")
      .select("amount, status, registration_payment_id")
      .eq("job_seeker_id", screenshot.job_seeker_id);

    if (installments && installments.length > 0) {
      const regPaymentId = installments[0].registration_payment_id;
      const amountPaid = installments
        .filter((i) => i.status === "paid")
        .reduce((sum, i) => sum + Number(i.amount), 0);

      const { data: regPay } = await supabaseAdmin
        .from("registration_payments")
        .select("total_amount, work_started")
        .eq("id", regPaymentId)
        .single();

      const isComplete = regPay && Math.abs(amountPaid - Number(regPay.total_amount)) < 0.01;
      const isPartial = amountPaid > 0 && !isComplete;

      const { error: regPayError } = await supabaseAdmin
        .from("registration_payments")
        .update({
          amount_paid: amountPaid,
          status: isComplete ? "complete" : isPartial ? "partial" : "pending",
          work_started: amountPaid > 0,
        })
        .eq("id", regPaymentId);

      if (regPayError) {
        console.error("[billing] failed to update registration_payments:", regPayError);
      }
    }
  }

  // Update payment request status if linked
  if (screenshot.payment_request_id) {
    const { error: reqUpdateError } = await supabaseAdmin
      .from("payment_requests")
      .update({ status: "acknowledged" })
      .eq("id", screenshot.payment_request_id);

    if (reqUpdateError) {
      console.error("[billing] failed to update payment_requests status:", reqUpdateError);
    }
  }

  // Notify seeker
  const { data: seeker } = await supabaseAdmin
    .from("job_seekers")
    .select("email, full_name")
    .eq("id", screenshot.job_seeker_id)
    .single();

  if (seeker?.email) {
    await sendAndLogEmail({
      to: seeker.email,
      subject: "Payment Confirmed — JobGenius",
      html: `
        <p>Hello ${seeker.full_name ?? ""},</p>
        <p>We have received and confirmed your payment. Thank you!</p>
        ${
          !screenshot.installment_id
            ? ""
            : "<p>Your installment has been marked as paid. Services will continue as scheduled.</p>"
        }
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/billing">View your billing status →</a></p>
      `,
      job_seeker_id: screenshot.job_seeker_id,
      template_key: "billing-payment-acknowledged",
    });
  }

  logAdminAction({
    adminId: auth.user.id,
    adminEmail: auth.user.email,
    action: "billing.acknowledge_payment",
    targetType: "payment_screenshot",
    targetId: screenshotId,
    details: { job_seeker_id: screenshot.job_seeker_id, installment_id: screenshot.installment_id },
  }).catch((e) => console.error("Audit log failed", e));

  return NextResponse.json({ ok: true });
}
