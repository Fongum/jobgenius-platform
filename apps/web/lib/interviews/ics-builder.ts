/**
 * Generates an .ics calendar event string for interview confirmations.
 */
export function buildIcsEvent(params: {
  summary: string;
  description: string;
  startAt: string; // ISO date string
  durationMin: number;
  location?: string | null;
  meetingLink?: string | null;
  organizerEmail?: string | null;
}): string {
  const start = toIcsDate(new Date(params.startAt));
  const end = toIcsDate(
    new Date(new Date(params.startAt).getTime() + params.durationMin * 60_000)
  );
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@joblinca.com`;
  const now = toIcsDate(new Date());

  const location = params.meetingLink ?? params.location ?? "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Joblinca//Interview//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(params.summary)}`,
    `DESCRIPTION:${icsEscape(params.description)}`,
    location ? `LOCATION:${icsEscape(location)}` : "",
    params.organizerEmail
      ? `ORGANIZER;CN=Joblinca:mailto:${params.organizerEmail}`
      : "",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.filter(Boolean).join("\r\n");
}

/**
 * Returns a data: URI that can be used as href for "Add to Calendar" links.
 */
export function icsToDataUri(icsContent: string): string {
  const encoded = encodeURIComponent(icsContent);
  return `data:text/calendar;charset=utf-8,${encoded}`;
}

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
