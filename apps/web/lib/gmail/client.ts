import { getValidAccessToken } from "./oauth";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailHeader = { name: string; value: string };

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    headers: GmailHeader[];
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; size: number };
      parts?: Array<{
        mimeType: string;
        body?: { data?: string; size: number };
      }>;
    }>;
  };
};

type MessageListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
};

function getHeader(headers: GmailHeader[], name: string): string | undefined {
  return headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value;
}

/**
 * Decode base64url-encoded Gmail body data to UTF-8 string.
 */
function decodeBody(data: string): string {
  // Gmail uses URL-safe base64 (replace - with + and _ with /)
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Extract plain text body from a Gmail message, handling multipart.
 */
export function extractTextBody(message: GmailMessage): string {
  const { payload } = message;

  // Simple single-part message
  if (payload.body?.data) {
    return decodeBody(payload.body.data);
  }

  // Multipart — look for text/plain first, then text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBody(part.body.data);
      }
      // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
      if (part.parts) {
        for (const sub of part.parts) {
          if (sub.mimeType === "text/plain" && sub.body?.data) {
            return decodeBody(sub.body.data);
          }
        }
      }
    }
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBody(part.body.data);
      }
      if (part.parts) {
        for (const sub of part.parts) {
          if (sub.mimeType === "text/html" && sub.body?.data) {
            return decodeBody(sub.body.data);
          }
        }
      }
    }
  }

  return "";
}

/**
 * Parse common headers from a Gmail message.
 */
export function parseMessageHeaders(message: GmailMessage) {
  const headers = message.payload.headers;
  return {
    from: getHeader(headers, "From") ?? "",
    to: getHeader(headers, "To") ?? "",
    subject: getHeader(headers, "Subject") ?? "",
    date: getHeader(headers, "Date") ?? "",
    messageId: getHeader(headers, "Message-ID") ?? "",
  };
}

/**
 * Extract sender name and email from a "From" header.
 * e.g. "John Doe <john@example.com>" → { name: "John Doe", email: "john@example.com" }
 */
export function parseFromHeader(from: string): {
  name: string;
  email: string;
} {
  const match = from.match(/^"?(.+?)"?\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: "", email: from.trim() };
}

export class GmailClient {
  private connectionId: string;

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }

  private async request(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await getValidAccessToken(this.connectionId);
    const response = await fetch(`${GMAIL_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gmail API error (${response.status}): ${text}`);
    }

    return response;
  }

  /**
   * List messages matching a query.
   */
  async listMessages(
    query: string,
    maxResults = 20,
    pageToken?: string
  ): Promise<MessageListResponse> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await this.request(`/messages?${params.toString()}`);
    return response.json();
  }

  /**
   * Get a full message by ID.
   */
  async getMessage(messageId: string): Promise<GmailMessage> {
    const response = await this.request(
      `/messages/${messageId}?format=full`
    );
    return response.json();
  }

  /**
   * Search inbox for messages matching a query and return parsed results.
   */
  async searchMessages(
    query: string,
    maxResults = 20
  ): Promise<
    Array<{
      id: string;
      threadId: string;
      from: string;
      fromName: string;
      fromEmail: string;
      to: string;
      subject: string;
      snippet: string;
      body: string;
      receivedAt: Date;
    }>
  > {
    const list = await this.listMessages(query, maxResults);
    if (!list.messages?.length) return [];

    const results = await Promise.all(
      list.messages.map(async (m) => {
        const msg = await this.getMessage(m.id);
        const headers = parseMessageHeaders(msg);
        const sender = parseFromHeader(headers.from);
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: headers.from,
          fromName: sender.name,
          fromEmail: sender.email,
          to: headers.to,
          subject: headers.subject,
          snippet: msg.snippet,
          body: extractTextBody(msg),
          receivedAt: new Date(parseInt(msg.internalDate, 10)),
        };
      })
    );

    return results;
  }

  /**
   * Send an email from the connected Gmail account.
   */
  async sendEmail(options: {
    to: string;
    subject: string;
    body: string;
    replyTo?: string;
    inReplyTo?: string;
    references?: string;
    cc?: string;
    bcc?: string;
  }): Promise<{ id: string; threadId: string }> {
    const lines: string[] = [
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
    ];

    if (options.cc) lines.push(`Cc: ${options.cc}`);
    if (options.bcc) lines.push(`Bcc: ${options.bcc}`);
    if (options.replyTo) lines.push(`Reply-To: ${options.replyTo}`);
    if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
    if (options.references) lines.push(`References: ${options.references}`);

    lines.push("", options.body);

    const raw = Buffer.from(lines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await this.request("/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });

    return response.json();
  }

  /**
   * Search for recent verification/OTP emails.
   * Looks for common verification code patterns in the last N minutes.
   */
  async findVerificationEmails(
    minutesAgo = 10
  ): Promise<
    Array<{
      id: string;
      from: string;
      subject: string;
      body: string;
      codes: string[];
      receivedAt: Date;
    }>
  > {
    const afterEpoch = Math.floor(
      (Date.now() - minutesAgo * 60 * 1000) / 1000
    );
    const query = `after:${afterEpoch} (subject:verify OR subject:verification OR subject:confirm OR subject:code OR subject:OTP)`;

    const messages = await this.searchMessages(query, 10);

    return messages.map((msg) => ({
      id: msg.id,
      from: msg.from,
      subject: msg.subject,
      body: msg.body,
      codes: extractVerificationCodes(msg.body + " " + msg.subject),
      receivedAt: msg.receivedAt,
    }));
  }
}

/**
 * Extract potential verification codes from text.
 * Looks for 4-8 digit numeric codes and common OTP patterns.
 */
function extractVerificationCodes(text: string): string[] {
  const codes: string[] = [];

  // Pattern: "code is 123456" or "code: 123456" or "verification code 123456"
  const codePatterns = [
    /(?:code|pin|otp|token)\s*(?:is|:)\s*(\d{4,8})/gi,
    /(?:verification|confirm|security)\s+(?:code|number|pin)\s*(?:is|:)?\s*(\d{4,8})/gi,
    /\b(\d{6})\b/g, // Standalone 6-digit numbers (most common OTP length)
  ];

  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const code = match[1];
      if (!codes.includes(code)) {
        codes.push(code);
      }
    }
  }

  return codes;
}
