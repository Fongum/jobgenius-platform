import { supabaseServer } from "@/lib/supabase/server";

const DEFAULT_REQUIRED_CONSENTS = [
  "OUTREACH_AUTOMATION",
  "OUTREACH_CONTACT_AUTHORIZATION",
  "OUTREACH_DATA_USAGE",
] as const;

function resolveRequiredConsents() {
  const fromEnv = (process.env.OUTREACH_REQUIRED_CONSENTS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (fromEnv.length > 0) {
    return fromEnv;
  }

  return [...DEFAULT_REQUIRED_CONSENTS];
}

export async function getOutreachConsentStatus(jobSeekerId: string) {
  const requiredConsents = resolveRequiredConsents();

  const { data, error } = await supabaseServer
    .from("jobseeker_consents")
    .select("consent_type, accepted_at, version")
    .eq("jobseeker_id", jobSeekerId)
    .in("consent_type", requiredConsents)
    .order("accepted_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      missing: requiredConsents,
      accepted: {} as Record<string, { accepted_at: string; version: string }>,
      error: "Failed to load jobseeker consents.",
    };
  }

  const accepted: Record<string, { accepted_at: string; version: string }> = {};
  for (const row of data ?? []) {
    if (!row?.consent_type || accepted[row.consent_type]) {
      continue;
    }
    accepted[row.consent_type] = {
      accepted_at: row.accepted_at,
      version: row.version,
    };
  }

  const missing = requiredConsents.filter((consentType) => !accepted[consentType]);

  return {
    ok: missing.length === 0,
    missing,
    accepted,
    error: null as string | null,
  };
}

export async function assertOutreachConsent(jobSeekerId: string) {
  const status = await getOutreachConsentStatus(jobSeekerId);
  if (!status.ok) {
    if (status.error) {
      return { ok: false, error: status.error } as const;
    }
    return {
      ok: false,
      error: `Missing required outreach consents: ${status.missing.join(", ")}.`,
    } as const;
  }

  return { ok: true } as const;
}

export async function getRecruiterOptOut(recruiterId: string) {
  const { data, error } = await supabaseServer
    .from("recruiter_opt_outs")
    .select("id, reason, source, opted_out_at")
    .eq("recruiter_id", recruiterId)
    .maybeSingle();

  if (error) {
    return { optedOut: false, error: "Failed to load opt-out state." } as const;
  }

  return { optedOut: Boolean(data), optOut: data ?? null, error: null as string | null } as const;
}

export async function recordRecruiterOptOut({
  recruiterId,
  recruiterThreadId,
  email,
  reason,
  source,
}: {
  recruiterId: string;
  recruiterThreadId?: string | null;
  email?: string | null;
  reason?: string | null;
  source: string;
}) {
  const nowIso = new Date().toISOString();
  return supabaseServer.from("recruiter_opt_outs").upsert(
    {
      recruiter_id: recruiterId,
      recruiter_thread_id: recruiterThreadId ?? null,
      email: email ?? null,
      reason: reason ?? null,
      source,
      opted_out_at: nowIso,
      created_at: nowIso,
    },
    { onConflict: "recruiter_id" }
  );
}
