import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import {
  MAX_POLICY_RUN_FREQUENCY_HOURS,
  MIN_POLICY_RUN_FREQUENCY_HOURS,
  normalizePolicyLocation,
  normalizePolicyRunFrequency,
  normalizePolicyTitle,
  syncValidatedDiscoverySearches,
} from "@/lib/discovery/policies";

type CreatePolicyPayload = {
  source_name?: string;
  job_title?: string;
  location?: string;
  run_frequency_hours?: number;
  enabled?: boolean;
};

function normalizeSourceName(sourceName: string) {
  return sourceName.trim().toLowerCase();
}

/**
 * GET /api/discovery/policies
 *
 * Admin/superadmin: list superadmin-validated discovery policies.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { data: policies, error: policiesError } = await supabaseAdmin
    .from("discovery_search_policies")
    .select(
      "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (policiesError) {
    return Response.json(
      { success: false, error: "Failed to load discovery policies." },
      { status: 500 }
    );
  }

  const { data: searches } = await supabaseAdmin
    .from("job_discovery_searches")
    .select("policy_id, enabled")
    .not("policy_id", "is", null)
    .is("job_seeker_id", null);

  const searchCountMap = new Map<string, { total: number; active: number }>();
  for (const search of searches ?? []) {
    if (!search.policy_id) continue;
    const summary = searchCountMap.get(search.policy_id) ?? { total: 0, active: 0 };
    summary.total += 1;
    if (search.enabled) {
      summary.active += 1;
    }
    searchCountMap.set(search.policy_id, summary);
  }

  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from("job_sources")
    .select("name, source_type, enabled")
    .order("name", { ascending: true });

  if (sourcesError) {
    return Response.json(
      { success: false, error: "Failed to load discovery sources." },
      { status: 500 }
    );
  }

  const policiesWithStats = (policies ?? []).map((policy) => ({
    ...policy,
    generated_searches: searchCountMap.get(policy.id)?.total ?? 0,
    active_generated_searches: searchCountMap.get(policy.id)?.active ?? 0,
  }));

  return Response.json({
    success: true,
    policies: policiesWithStats,
    sources: sources ?? [],
    limits: {
      run_frequency_hours: {
        min: MIN_POLICY_RUN_FREQUENCY_HOURS,
        max: MAX_POLICY_RUN_FREQUENCY_HOURS,
      },
    },
  });
}

/**
 * POST /api/discovery/policies
 *
 * Superadmin only: create a validated discovery policy.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (auth.user.role !== "superadmin") {
    return Response.json(
      { success: false, error: "Only super admins can create discovery policies." },
      { status: 403 }
    );
  }

  let payload: CreatePolicyPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const sourceName = normalizeSourceName(payload.source_name ?? "");
  const jobTitle = normalizePolicyTitle(payload.job_title ?? "");
  const location = normalizePolicyLocation(payload.location ?? "");

  if (!sourceName || !jobTitle || !location) {
    return Response.json(
      {
        success: false,
        error: "source_name, job_title, and location are required.",
      },
      { status: 400 }
    );
  }

  const runFrequencyHours = normalizePolicyRunFrequency(payload.run_frequency_hours);

  const { data: source } = await supabaseAdmin
    .from("job_sources")
    .select("name")
    .eq("name", sourceName)
    .maybeSingle();

  if (!source) {
    return Response.json(
      { success: false, error: `Unknown source: ${sourceName}` },
      { status: 400 }
    );
  }

  const { data: policy, error: insertError } = await supabaseAdmin
    .from("discovery_search_policies")
    .insert({
      source_name: sourceName,
      job_title: jobTitle,
      location,
      run_frequency_hours: runFrequencyHours,
      enabled: payload.enabled ?? true,
      created_by_am_id: auth.user.id,
      updated_by_am_id: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
    )
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return Response.json(
        {
          success: false,
          error: "This title/location policy already exists for the source.",
        },
        { status: 409 }
      );
    }
    return Response.json(
      { success: false, error: "Failed to create discovery policy." },
      { status: 500 }
    );
  }

  try {
    const sync = await syncValidatedDiscoverySearches();
    return Response.json({
      success: true,
      policy,
      sync,
    });
  } catch (syncError) {
    console.error("Discovery policy sync failed after create:", syncError);
    return Response.json({
      success: true,
      policy,
      sync: null,
      warning: "Policy created, but search sync failed. Runner will retry sync.",
    });
  }
}
