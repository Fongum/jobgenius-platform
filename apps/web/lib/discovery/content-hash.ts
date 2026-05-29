import { createHash } from "node:crypto";

export function normalizeDiscoveryText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function computeDiscoveredJobContentHash(job: {
  title: string | null | undefined;
  company: string | null | undefined;
  location: string | null | undefined;
  description_text: string | null | undefined;
}) {
  const fingerprint = [
    normalizeDiscoveryText(job.title),
    normalizeDiscoveryText(job.company),
    normalizeDiscoveryText(job.location),
    normalizeDiscoveryText(job.description_text),
  ].join("::");

  return createHash("sha256").update(fingerprint).digest("hex");
}
