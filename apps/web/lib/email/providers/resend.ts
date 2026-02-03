import type { EmailSendAdapter, EmailSendInput, EmailSendOutput } from "@/lib/email/adapter";

export class ResendEmailProvider implements EmailSendAdapter {
  async sendEmail(request: EmailSendInput): Promise<EmailSendOutput> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.OUTREACH_FROM_EMAIL;
    const replyTo = request.replyTo ?? process.env.OUTREACH_REPLY_TO_EMAIL ?? undefined;

    if (!apiKey || !fromEmail) {
      return {
        ok: false,
        provider: "resend",
        detail: "Missing RESEND_API_KEY or OUTREACH_FROM_EMAIL.",
      };
    }

    const payload = {
      from: request.from ?? fromEmail,
      to: request.to,
      subject: request.subject,
      html: request.html ?? undefined,
      text: request.text ?? undefined,
      reply_to: replyTo ?? undefined,
      headers: request.headers ?? undefined,
    };

    if (!payload.html && !payload.text) {
      payload.text = "";
    }

    if (request.metadata && Object.keys(request.metadata).length > 0) {
      payload.headers = {
        ...(payload.headers ?? {}),
        "X-JobGenius-Metadata": JSON.stringify(request.metadata),
      };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        provider: "resend",
        detail: `Resend failed (${response.status}): ${text}`,
      };
    }

    const data = await response.json();
    return {
      ok: true,
      provider: "resend",
      provider_message_id: data?.id ?? undefined,
    };
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
