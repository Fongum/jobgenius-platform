import { ResendEmailProvider } from "@/lib/email/providers/resend";

export type EmailSendRequest = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
};

export type EmailSendResult = {
  ok: boolean;
  provider: string;
  messageId?: string;
  detail?: string;
};

export type EmailSendInput = {
  from: string;
  to: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  replyTo?: string | null;
  headers?: Record<string, string>;
  metadata?: Record<string, string | number | boolean>;
};

export type EmailSendOutput = {
  ok: boolean;
  provider: string;
  provider_message_id?: string;
  detail?: string;
};

export interface EmailSendAdapter {
  sendEmail(request: EmailSendInput): Promise<EmailSendOutput>;
  send(request: EmailSendRequest): Promise<EmailSendResult>;
}

class StubEmailAdapter implements EmailSendAdapter {
  async sendEmail(request: EmailSendInput): Promise<EmailSendOutput> {
    return {
      ok: true,
      provider: "stub",
      provider_message_id: `stub-${Date.now()}`,
      detail: `Stubbed send to ${request.to.join(", ")}`,
    };
  }

  async send(request: EmailSendRequest): Promise<EmailSendResult> {
    const result = await this.sendEmail({
      from: request.from,
      to: request.to,
      subject: request.subject,
      text: request.body,
    });
    return {
      ok: result.ok,
      provider: result.provider,
      messageId: result.provider_message_id,
      detail: result.detail,
    };
  }
}

export function getEmailAdapter(): EmailSendAdapter {
  const provider = process.env.EMAIL_SEND_PROVIDER ?? "stub";
  const isProduction =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (provider === "stub" && isProduction) {
    throw new Error("EMAIL_SEND_PROVIDER must be set to 'resend' in production.");
  }

  if (provider === "resend") {
    return new ResendEmailProvider();
  }

  if (provider !== "stub") {
    throw new Error(`Unsupported EMAIL_SEND_PROVIDER: ${provider}`);
  }

  return new StubEmailAdapter();
}
