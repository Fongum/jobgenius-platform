import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import DiscoveryRulesClient from "./DiscoveryRulesClient";

type PolicyRow = {
  id: string;
  source_name: string;
  job_title: string;
  location: string;
  run_frequency_hours: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type SourceRow = {
  name: string;
  source_type: string | null;
  enabled: boolean | null;
};

export default async function DiscoveryAdminPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const isSuperAdmin = user.role === "superadmin";

  const [{ data: policiesData }, { data: sourcesData }, { data: generatedSearchesData }] =
    await Promise.all([
      supabaseAdmin
        .from("discovery_search_policies")
        .select(
          "id, source_name, job_title, location, run_frequency_hours, enabled, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("job_sources")
        .select("name, source_type, enabled")
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("job_discovery_searches")
        .select("policy_id, enabled")
        .not("policy_id", "is", null)
        .is("job_seeker_id", null),
    ]);

  const policies = (policiesData ?? []) as PolicyRow[];
  const sources = (sourcesData ?? []) as SourceRow[];
  const generatedSearches = (generatedSearchesData ?? []) as {
    policy_id: string | null;
    enabled: boolean;
  }[];

  const policyGeneratedMap = new Map<string, { total: number; active: number }>();
  for (const row of generatedSearches) {
    if (!row.policy_id) continue;
    const stats = policyGeneratedMap.get(row.policy_id) ?? { total: 0, active: 0 };
    stats.total += 1;
    if (row.enabled) {
      stats.active += 1;
    }
    policyGeneratedMap.set(row.policy_id, stats);
  }

  const policiesWithStats = policies.map((policy) => ({
    ...policy,
    generated_searches: policyGeneratedMap.get(policy.id)?.total ?? 0,
    active_generated_searches: policyGeneratedMap.get(policy.id)?.active ?? 0,
  }));

  const activeGeneratedSearches = generatedSearches.filter((row) => row.enabled).length;

  return (
    <DiscoveryRulesClient
      policies={policiesWithStats}
      sources={sources}
      isSuperAdmin={isSuperAdmin}
      activeGeneratedSearches={activeGeneratedSearches}
      totalGeneratedSearches={generatedSearches.length}
    />
  );
}
