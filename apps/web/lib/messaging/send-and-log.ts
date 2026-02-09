import { getEmailAdapter, type EmailSendOutput } from "@/lib/email/adapter";
import { supabaseServer } from "@/lib/supabase/server";

export type SendAndLogOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  template_key?: string;
  job_seeker_id?: string;
  job_post_id?: string;
  interview_id?: string;
  application_queue_id?: string;
  meta?: Record<string, unknown>;
};

export type SendAndLogResult = {
  ok: boolean;
  email_log_id?: string;
  provider_message_id?: string;
  detail?: string;
};

export async function sendAndLogEmail(
  options: SendAndLogOptions
): Promise<SendAndLogResult> {
  const configuredFrom =
    process.env.EMAIL_FROM_ADDRESS ?? process.env.OUTREACH_FROM_EMAIL ?? null;
  const isProduction =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const fromEmail =
    configuredFrom ?? (isProduction ? null : "noreply@joblinca.com");

  if (!fromEmail) {
    throw new Error("EMAIL_FROM_ADDRESS or OUTREACH_FROM_EMAIL is required in production.");
  }

  const adapter = getEmailAdapter();
  let result: EmailSendOutput;

  try {
    result = await adapter.sendEmail({
      from: fromEmail,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text ?? null,
    });
  } catch (err) {
    result = {
      ok: false,
      provider: "resend",
      detail: err instanceof Error ? err.message : "Unknown send error",
    };
  }

  const { data: logRow } = await supabaseServer
    .from("email_logs")
    .insert({
      to_email: options.to,
      from_email: fromEmail,
      subject: options.subject,
      template_key: options.template_key ?? null,
      status: result.ok ? "sent" : "failed",
      provider: result.provider ?? "resend",
      provider_message_id: result.provider_message_id ?? null,
      error_detail: result.ok ? null : (result.detail ?? null),
      job_seeker_id: options.job_seeker_id ?? null,
      job_post_id: options.job_post_id ?? null,
      interview_id: options.interview_id ?? null,
      application_queue_id: options.application_queue_id ?? null,
      meta: options.meta ?? {},
    })
    .select("id")
    .single();

  return {
    ok: result.ok,
    email_log_id: logRow?.id ?? undefined,
    provider_message_id: result.provider_message_id,
    detail: result.detail,
  };
}
