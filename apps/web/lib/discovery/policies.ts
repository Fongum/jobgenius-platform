import { supabaseServer } from "@/lib/supabase/server";

export const DEFAULT_POLICY_RUN_FREQUENCY_HOURS = 24;
export const MIN_POLICY_RUN_FREQUENCY_HOURS = 1;
export const MAX_POLICY_RUN_FREQUENCY_HOURS = 168;

type DiscoveryPolicyRow = {
  id: string;
  source_name: string;
  job_title: string;
  location: string;
  run_frequency_hours: number | null;
  enabled: boolean | null;
};

type JobSourceRow = {
  id: string;
  name: string;
  base_url: string;
  enabled: boolean | null;
};

type PolicySearchRow = {
  id: string;
  policy_id: string | null;
  job_seeker_id: string | null;
  source_id: string;
  search_name: string;
  search_url: string;
  keywords: string[] | null;
  location: string | null;
  filters: Record<string, unknown> | null;
  run_frequency_hours: number | null;
  enabled: boolean;
};

export type DiscoveryPolicySyncSummary = {
  created: number;
  updated: number;
  disabled: number;
  total_policies: number;
  active_searches: number;
};

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSourceName(sourceName: string) {
  return normalizeWhitespace(sourceName).toLowerCase();
}

export function normalizePolicyTitle(input: string) {
  return normalizeWhitespace(input);
}

export function normalizePolicyLocation(input: string) {
  return normalizeWhitespace(input);
}

export function normalizePolicyRunFrequency(hours: number | null | undefined) {
  if (!Number.isFinite(hours)) {
    return DEFAULT_POLICY_RUN_FREQUENCY_HOURS;
  }
  const numeric = Number(hours);
  if (numeric < MIN_POLICY_RUN_FREQUENCY_HOURS) {
    return MIN_POLICY_RUN_FREQUENCY_HOURS;
  }
  if (numeric > MAX_POLICY_RUN_FREQUENCY_HOURS) {
    return MAX_POLICY_RUN_FREQUENCY_HOURS;
  }
  return Math.round(numeric);
}

function sameTextArray(a: string[] | null | undefined, b: string[] | null | undefined) {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function jsonComparable(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseUrl(baseUrl: string, fallbackUrl: string) {
  try {
    return new URL(baseUrl);
  } catch {
    return new URL(fallbackUrl);
  }
}

export function buildDiscoverySearchUrl(
  sourceName: string,
  baseUrl: string,
  jobTitle: string,
  location: string
) {
  const normalizedSource = normalizeSourceName(sourceName);
  const normalizedTitle = normalizePolicyTitle(jobTitle);
  const normalizedLocation = normalizePolicyLocation(location);

  if (normalizedSource === "linkedin") {
    const url = parseUrl(baseUrl, "https://www.linkedin.com/jobs/search");
    url.searchParams.set("keywords", normalizedTitle);
    url.searchParams.set("location", normalizedLocation);
    return url.toString();
  }

  if (normalizedSource === "indeed") {
    const url = parseUrl(baseUrl, "https://www.indeed.com/jobs");
    url.searchParams.set("q", normalizedTitle);
    url.searchParams.set("l", normalizedLocation);
    return url.toString();
  }

  if (normalizedSource === "glassdoor") {
    const url = parseUrl(baseUrl, "https://www.glassdoor.com/Job/jobs.htm");
    if (!/jobs\.htm$/i.test(url.pathname)) {
      const basePath = url.pathname.replace(/\/+$/, "");
      url.pathname = basePath.toLowerCase().endsWith("/job")
        ? `${basePath}/jobs.htm`
        : "/Job/jobs.htm";
    }
    url.searchParams.set("sc.keyword", normalizedTitle);
    url.searchParams.set("locKeyword", normalizedLocation);
    return url.toString();
  }

  const url = parseUrl(baseUrl, "https://www.linkedin.com/jobs/search");
  url.searchParams.set("keywords", normalizedTitle);
  url.searchParams.set("location", normalizedLocation);
  return url.toString();
}

async function disablePolicySearch(searchId: string, updatedAt: string) {
  const { error } = await supabaseServer
    .from("job_discovery_searches")
    .update({
      enabled: false,
      updated_at: updatedAt,
    })
    .eq("id", searchId);

  if (error) {
    throw new Error(`Failed to disable policy search ${searchId}.`);
  }
}

export async function syncValidatedDiscoverySearches(): Promise<DiscoveryPolicySyncSummary> {
  const nowIso = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let disabled = 0;

  const { data: policiesData, error: policiesError } = await supabaseServer
    .from("discovery_search_policies")
    .select("id, source_name, job_title, location, run_frequency_hours, enabled")
    .order("created_at", { ascending: false });

  if (policiesError) {
    throw new Error("Failed to fetch discovery policies.");
  }

  const policies = (policiesData ?? []) as DiscoveryPolicyRow[];
  const policyIds = new Set(policies.map((policy) => policy.id));

  const { data: existingData, error: existingError } = await supabaseServer
    .from("job_discovery_searches")
    .select(
      "id, policy_id, job_seeker_id, source_id, search_name, search_url, keywords, location, filters, run_frequency_hours, enabled"
    )
    .not("policy_id", "is", null);

  if (existingError) {
    throw new Error("Failed to fetch policy-linked discovery searches.");
  }

  const policySearches = ((existingData ?? []) as PolicySearchRow[]).filter(
    (search) => !search.job_seeker_id && !!search.policy_id
  );
  const existingByPolicyId = new Map(
    policySearches.map((search) => [search.policy_id as string, search])
  );

  const sourceNames = Array.from(
    new Set(policies.map((policy) => normalizeSourceName(policy.source_name)))
  );

  let sourceMap = new Map<string, JobSourceRow>();
  if (sourceNames.length > 0) {
    const { data: sourcesData, error: sourcesError } = await supabaseServer
      .from("job_sources")
      .select("id, name, base_url, enabled")
      .in("name", sourceNames);

    if (sourcesError) {
      throw new Error("Failed to fetch job sources for discovery policies.");
    }

    sourceMap = new Map(
      ((sourcesData ?? []) as JobSourceRow[]).map((source) => [
        normalizeSourceName(source.name),
        source,
      ])
    );
  }

  for (const policy of policies) {
    const sourceName = normalizeSourceName(policy.source_name);
    const existingSearch = existingByPolicyId.get(policy.id);
    const source = sourceMap.get(sourceName);

    if (!source) {
      if (existingSearch?.enabled) {
        await disablePolicySearch(existingSearch.id, nowIso);
        disabled += 1;
      }
      continue;
    }

    const desiredEnabled = Boolean(policy.enabled) && Boolean(source.enabled);
    const desiredRunFrequency = normalizePolicyRunFrequency(policy.run_frequency_hours);
    const desiredTitle = normalizePolicyTitle(policy.job_title);
    const desiredLocation = normalizePolicyLocation(policy.location);
    const desiredSearchName = `${desiredTitle} - ${desiredLocation}`;
    const desiredSearchUrl = buildDiscoverySearchUrl(
      sourceName,
      source.base_url,
      desiredTitle,
      desiredLocation
    );
    const desiredKeywords = [desiredTitle];
    const desiredFilters = {
      managed_by: "superadmin_policy",
      policy_id: policy.id,
      validated: true,
    };

    if (!existingSearch) {
      const { error: insertError } = await supabaseServer
        .from("job_discovery_searches")
        .insert({
          policy_id: policy.id,
          job_seeker_id: null,
          source_id: source.id,
          search_name: desiredSearchName,
          search_url: desiredSearchUrl,
          keywords: desiredKeywords,
          location: desiredLocation,
          filters: desiredFilters,
          run_frequency_hours: desiredRunFrequency,
          enabled: desiredEnabled,
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (insertError) {
        throw new Error(`Failed to create discovery search for policy ${policy.id}.`);
      }

      created += 1;
      continue;
    }

    const hasChanges =
      existingSearch.source_id !== source.id ||
      existingSearch.search_name !== desiredSearchName ||
      existingSearch.search_url !== desiredSearchUrl ||
      !sameTextArray(existingSearch.keywords, desiredKeywords) ||
      (existingSearch.location ?? null) !== desiredLocation ||
      normalizePolicyRunFrequency(existingSearch.run_frequency_hours) !== desiredRunFrequency ||
      existingSearch.enabled !== desiredEnabled ||
      jsonComparable(existingSearch.filters) !== jsonComparable(desiredFilters);

    if (!hasChanges) {
      continue;
    }

    const { error: updateError } = await supabaseServer
      .from("job_discovery_searches")
      .update({
        source_id: source.id,
        search_name: desiredSearchName,
        search_url: desiredSearchUrl,
        keywords: desiredKeywords,
        location: desiredLocation,
        filters: desiredFilters,
        run_frequency_hours: desiredRunFrequency,
        enabled: desiredEnabled,
        updated_at: nowIso,
      })
      .eq("id", existingSearch.id);

    if (updateError) {
      throw new Error(`Failed to update discovery search for policy ${policy.id}.`);
    }

    updated += 1;
  }

  for (const existingSearch of policySearches) {
    const policyId = existingSearch.policy_id;
    if (!policyId || policyIds.has(policyId)) {
      continue;
    }
    if (!existingSearch.enabled) {
      continue;
    }
    await disablePolicySearch(existingSearch.id, nowIso);
    disabled += 1;
  }

  const { count: activeSearchesCount } = await supabaseServer
    .from("job_discovery_searches")
    .select("id", { count: "exact", head: true })
    .not("policy_id", "is", null)
    .is("job_seeker_id", null)
    .eq("enabled", true);

  return {
    created,
    updated,
    disabled,
    total_policies: policies.length,
    active_searches: activeSearchesCount ?? 0,
  };
}
