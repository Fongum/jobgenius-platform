import type { EmailSendAdapter, EmailSendInput, EmailSendOutput } from "@/lib/email/adapter";
import { GmailClient } from "@/lib/gmail/client";

/**
 * Gmail email provider — sends emails from a seeker's connected Gmail account.
 * Requires a connectionId (seeker_email_connections.id) at construction.
 */
export class GmailEmailProvider implements EmailSendAdapter {
  private client: GmailClient;
  private connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
    this.client = new GmailClient(connectionId);
  }

  async sendEmail(request: EmailSendInput): Promise<EmailSendOutput> {
    try {
      const result = await this.client.sendEmail({
        to: request.to.join(", "),
        subject: request.subject,
        body: request.html ?? request.text ?? "",
        replyTo: request.replyTo ?? undefined,
        cc: undefined,
        bcc: undefined,
      });

      return {
        ok: true,
        provider: "gmail",
        provider_message_id: result.id,
      };
    } catch (err) {
      return {
        ok: false,
        provider: "gmail",
        detail:
          err instanceof Error
            ? err.message
            : "Gmail send failed",
      };
    }
  }

  async send(request: {
    from: string;
    to: string[];
    subject: string;
    body: string;
  }): Promise<{ ok: boolean; provider: string; messageId?: string; detail?: string }> {
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
