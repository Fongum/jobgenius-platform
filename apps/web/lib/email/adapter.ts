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

export interface EmailSendAdapter {
  send(request: EmailSendRequest): Promise<EmailSendResult>;
}

class StubEmailAdapter implements EmailSendAdapter {
  async send(request: EmailSendRequest): Promise<EmailSendResult> {
    return {
      ok: true,
      provider: "stub",
      messageId: `stub-${Date.now()}`,
      detail: `Stubbed send to ${request.to.join(", ")}`,
    };
  }
}

export function getEmailAdapter(): EmailSendAdapter {
  const provider = process.env.EMAIL_SEND_PROVIDER ?? "stub";

  if (provider === "stub") {
    return new StubEmailAdapter();
  }

  return new StubEmailAdapter();
}
