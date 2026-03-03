/**
 * Intelligent Job Match Scoring Algorithm
 *
 * Computes a comprehensive match score between a job seeker and a job posting
 * based on multiple weighted factors.
 */

import type {
  JobSeekerProfile,
  JobPost,
  LocationPreference,
  MatchResult,
  MatchScoreBreakdown,
  MatchConfidence,
  MatchRecommendation,
  ScoringWeights,
  DEFAULT_WEIGHTS,
} from "./types";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalizeString(str: string): string {
  return str.trim().toLowerCase();
}

function normalizeArray(arr: string[] | null | undefined): string[] {
  if (!arr) return [];
  return arr.map(normalizeString).filter((s) => s.length > 0);
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "for",
  "of",
  "to",
  "in",
  "with",
  "at",
  "on",
  "sr",
  "jr",
  "senior",
  "junior",
  "lead",
  "principal",
  "staff",
  "mid",
  "level",
  "manager",
  "management",
  "specialist",
  "analyst",
  "associate",
  "coordinator",
  "consultant",
  "representative",
  "administrator",
  "officer",
  "executive",
  "intern",
  "trainee",
  "apprentice",
  "engineer",
  "developer",
]);

const TITLE_TOKEN_NORMALIZATIONS: Record<string, string> = {
  cybersecurity: "security",
  cyber: "security",
  infosec: "security",
  secops: "security",
  frontend: "front-end",
  frontendend: "front-end",
  backend: "back-end",
  fullstack: "full-stack",
  productowner: "product",
  presales: "pre-sales",
};

type TitleAlignment = {
  exact: boolean;
  partial: boolean;
  matchedTitles: string[];
  partialMatches: string[];
  bestTokenOverlap: number;
  sharedFamilies: string[];
  hardMismatch: boolean;
};

function canonicalizeTitleToken(token: string): string {
  const base = normalizeString(token).replace(/[^a-z0-9+#]+/g, "");
  if (!base) return "";
  return TITLE_TOKEN_NORMALIZATIONS[base] ?? base;
}

function tokenizeTitle(title: string): string[] {
  return normalizeString(title)
    .replace(/[^a-z0-9+#/ -]+/g, " ")
    .split(/[\s/()-]+/)
    .map(canonicalizeTitleToken)
    .filter((token) => token.length > 0 && !TITLE_STOP_WORDS.has(token));
}

function detectTitleFamilies(title: string): Set<string> {
  const normalizedTitle = normalizeString(title);
  const tokens = tokenizeTitle(title);
  const combined = new Set<string>([normalizedTitle, ...tokens]);
  const families = new Set<string>();

  const familyRules: Array<[string, string[]]> = [
    [
      "security",
      ["security", "threat", "soc", "siem", "iam", "incident", "infosec", "cyber"],
    ],
    [
      "software",
      ["software", "platform", "devops", "sre", "qa", "automation", "front-end", "back-end", "full-stack"],
    ],
    [
      "data",
      ["data", "analytics", "bi", "reporting", "insights", "machinelearning", "ml"],
    ],
    [
      "product",
      ["product", "roadmap", "owner"],
    ],
    [
      "marketing",
      ["marketing", "brand", "content", "seo", "sem", "communications", "copywriter", "growth"],
    ],
    [
      "sales_customer",
      ["sales", "account", "customer", "solution", "support", "success", "revenue", "partnership"],
    ],
    [
      "people_hr",
      ["recruit", "recruiting", "recruiter", "talent", "people", "hr", "humanresources"],
    ],
    [
      "design",
      ["design", "designer", "ux", "ui", "creative", "visual"],
    ],
    [
      "finance",
      ["finance", "financial", "accounting", "controller", "audit", "fp&a", "bookkeeping"],
    ],
    [
      "operations",
      ["operations", "ops", "logistics", "supply", "program", "project", "delivery"],
    ],
  ];

  for (const [family, keywords] of familyRules) {
    if (
      keywords.some((keyword) => {
        const canonicalKeyword = canonicalizeTitleToken(keyword);
        return (
          combined.has(canonicalKeyword) ||
          normalizedTitle.includes(keyword)
        );
      })
    ) {
      families.add(family);
    }
  }

  return families;
}

function analyzeTitleAlignment(
  targetTitles: string[] | null | undefined,
  rawJobTitle: string
): TitleAlignment {
  const normalizedTargets = normalizeArray(targetTitles);
  const jobTitle = normalizeString(rawJobTitle);
  const jobTokens = new Set(tokenizeTitle(rawJobTitle));
  const jobFamilies = detectTitleFamilies(rawJobTitle);

  const matchedTitles: string[] = [];
  const partialMatches: string[] = [];
  let bestTokenOverlap = 0;
  const sharedFamilies = new Set<string>();

  for (const target of normalizedTargets) {
    if (jobTitle.includes(target)) {
      matchedTitles.push(target);
      continue;
    }

    const targetTokens = tokenizeTitle(target);
    const matchedTokenCount = targetTokens.filter((token) => jobTokens.has(token)).length;
    const tokenOverlap =
      targetTokens.length > 0 ? matchedTokenCount / targetTokens.length : 0;
    bestTokenOverlap = Math.max(bestTokenOverlap, tokenOverlap);

    const targetFamilies = detectTitleFamilies(target);
    for (const family of Array.from(targetFamilies)) {
      if (jobFamilies.has(family)) {
        sharedFamilies.add(family);
      }
    }

    if (
      tokenOverlap >= 0.6 ||
      (matchedTokenCount >= 2 && targetTokens.length >= 2)
    ) {
      partialMatches.push(target);
    } else if (tokenOverlap >= 0.4 && targetFamilies.size > 0) {
      partialMatches.push(target);
    }
  }

  const hasFamilies = normalizedTargets.some((target) => detectTitleFamilies(target).size > 0);
  const hardMismatch =
    matchedTitles.length === 0 &&
    partialMatches.length === 0 &&
    hasFamilies &&
    jobFamilies.size > 0 &&
    sharedFamilies.size === 0 &&
    bestTokenOverlap < 0.25;

  return {
    exact: matchedTitles.length > 0,
    partial: partialMatches.length > 0,
    matchedTitles,
    partialMatches,
    bestTokenOverlap,
    sharedFamilies: Array.from(sharedFamilies),
    hardMismatch,
  };
}

/**
 * Calculate overlap percentage between two ranges
 */
function rangeOverlapPercent(
  min1: number,
  max1: number,
  min2: number,
  max2: number
): number {
  const overlapStart = Math.max(min1, min2);
  const overlapEnd = Math.min(max1, max2);

  if (overlapStart > overlapEnd) return 0;

  const overlapSize = overlapEnd - overlapStart;
  const smallerRange = Math.min(max1 - min1, max2 - min2);

  if (smallerRange <= 0) return overlapStart <= max1 && overlapStart >= min1 ? 100 : 0;

  return Math.round((overlapSize / smallerRange) * 100);
}

/**
 * Fuzzy string matching for titles and skills
 */
function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalizeString(needle);
  const h = normalizeString(haystack);

  // Exact match
  if (h.includes(n)) return true;

  // Handle common variations
  const variations: Record<string, string[]> = {
    javascript: ["js"],
    typescript: ["ts"],
    "react.js": ["react", "reactjs"],
    "node.js": ["node", "nodejs"],
    "vue.js": ["vue", "vuejs"],
    "c#": ["csharp", "c sharp"],
    "c++": ["cpp"],
    golang: ["go"],
    postgresql: ["postgres", "psql"],
    kubernetes: ["k8s"],
  };

  for (const [main, alts] of Object.entries(variations)) {
    if (n === main || alts.includes(n)) {
      if (h.includes(main) || alts.some((alt) => h.includes(alt))) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// COMPONENT SCORERS
// ============================================================================

function scoreSkills(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["skills"] {
  const seekerSkills = normalizeArray(seeker.skills);
  const jobRequired = normalizeArray(job.required_skills);
  const jobPreferred = normalizeArray(job.preferred_skills);

  // Also check description for skills if structured data is missing
  const descriptionLower = (job.description_text ?? "").toLowerCase();

  const matchedRequired: string[] = [];
  const matchedPreferred: string[] = [];
  const missingRequired: string[] = [];

  // Check required skills
  for (const skill of jobRequired) {
    const found = seekerSkills.some((s) => fuzzyMatch(s, skill) || fuzzyMatch(skill, s));
    if (found) {
      matchedRequired.push(skill);
    } else {
      missingRequired.push(skill);
    }
  }

  // Check preferred skills
  for (const skill of jobPreferred) {
    const found = seekerSkills.some((s) => fuzzyMatch(s, skill) || fuzzyMatch(skill, s));
    if (found) {
      matchedPreferred.push(skill);
    }
  }

  // Fallback: check seeker skills against description
  if (jobRequired.length === 0 && jobPreferred.length === 0) {
    for (const skill of seekerSkills) {
      if (fuzzyMatch(skill, descriptionLower)) {
        matchedRequired.push(skill);
      }
    }
  }

  // Calculate score
  let score = 0;
  const totalJobSkills = jobRequired.length + jobPreferred.length;

  if (totalJobSkills > 0) {
    // Required skills worth 80% of skills score, preferred worth 20%
    const requiredWeight = 0.8;
    const preferredWeight = 0.2;

    const requiredScore =
      jobRequired.length > 0
        ? (matchedRequired.length / jobRequired.length) * maxScore * requiredWeight
        : maxScore * requiredWeight;

    const preferredScore =
      jobPreferred.length > 0
        ? (matchedPreferred.length / jobPreferred.length) * maxScore * preferredWeight
        : 0;

    score = Math.round(requiredScore + preferredScore);
  } else if (matchedRequired.length > 0) {
    // Fallback scoring when no structured skills
    score = Math.min(maxScore, matchedRequired.length * 7);
  }

  const coveragePct =
    jobRequired.length > 0
      ? Math.round((matchedRequired.length / jobRequired.length) * 100)
      : 100;

  return {
    score: Math.min(maxScore, score),
    max: maxScore,
    details: {
      matched_required: matchedRequired,
      matched_preferred: matchedPreferred,
      missing_required: missingRequired,
      coverage_pct: coveragePct,
    },
  };
}

function scoreTitle(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["title"] {
  const alignment = analyzeTitleAlignment(seeker.target_titles, job.title);

  let score = 0;
  if (alignment.exact) {
    score = maxScore;
  } else if (alignment.partial) {
    const overlapBoost = Math.min(0.2, alignment.bestTokenOverlap * 0.2);
    score = Math.round(maxScore * (0.5 + overlapBoost));
  } else if (alignment.sharedFamilies.length > 0) {
    score = Math.round(maxScore * 0.25);
  }

  return {
    score,
    max: maxScore,
    details: {
      matched_titles: alignment.matchedTitles,
      partial_matches: alignment.partialMatches,
    },
  };
}

function scoreExperience(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["experience"] {
  const seekerYears = seeker.years_experience;
  const jobMin = job.years_experience_min;
  const jobMax = job.years_experience_max;

  let score = 0;
  let matchType: "exact" | "close" | "over" | "under" | "unknown" = "unknown";

  if (seekerYears === null || (jobMin === null && jobMax === null)) {
    // Can't determine, give only light neutral credit
    score = Math.round(maxScore * 0.2);
    matchType = "unknown";
  } else {
    const effectiveJobMin = jobMin ?? 0;
    const effectiveJobMax = jobMax ?? effectiveJobMin + 5;

    if (seekerYears >= effectiveJobMin && seekerYears <= effectiveJobMax) {
      score = maxScore;
      matchType = "exact";
    } else if (seekerYears > effectiveJobMax) {
      // Overqualified - slight penalty but still good
      score = Math.round(maxScore * 0.8);
      matchType = "over";
    } else if (seekerYears >= effectiveJobMin - 1) {
      // Close to minimum
      score = Math.round(maxScore * 0.6);
      matchType = "close";
    } else {
      // Under-experienced
      const gap = effectiveJobMin - seekerYears;
      score = Math.max(0, Math.round(maxScore * (1 - gap * 0.2)));
      matchType = "under";
    }
  }

  return {
    score,
    max: maxScore,
    details: {
      seeker_years: seekerYears,
      job_min: jobMin,
      job_max: jobMax,
      match_type: matchType,
    },
  };
}

function scoreSalary(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["salary"] {
  const seekerMin = seeker.salary_min;
  const seekerMax = seeker.salary_max;
  const jobMin = job.salary_min;
  const jobMax = job.salary_max;

  let score = 0;
  let overlapPct = 0;
  let matchType: "full" | "partial" | "none" | "unknown" = "unknown";

  // If either side has no salary info, give partial credit
  if (
    (seekerMin === null && seekerMax === null) ||
    (jobMin === null && jobMax === null)
  ) {
    score = Math.round(maxScore * 0.15);
    matchType = "unknown";
  } else {
    const effectiveSeekerMin = seekerMin ?? 0;
    const effectiveSeekerMax = seekerMax ?? effectiveSeekerMin * 1.5;
    const effectiveJobMin = jobMin ?? 0;
    const effectiveJobMax = jobMax ?? effectiveJobMin * 1.3;

    overlapPct = rangeOverlapPercent(
      effectiveSeekerMin,
      effectiveSeekerMax,
      effectiveJobMin,
      effectiveJobMax
    );

    if (overlapPct >= 80) {
      score = maxScore;
      matchType = "full";
    } else if (overlapPct > 0) {
      score = Math.round((overlapPct / 100) * maxScore);
      matchType = "partial";
    } else {
      score = 0;
      matchType = "none";
    }
  }

  return {
    score,
    max: maxScore,
    details: {
      seeker_min: seekerMin,
      seeker_max: seekerMax,
      job_min: jobMin,
      job_max: jobMax,
      overlap_pct: overlapPct,
      match_type: matchType,
    },
  };
}

/**
 * Score location match using new location_preferences if available,
 * otherwise fall back to the existing flat-field logic for backward compatibility.
 */
function scoreLocationWithPreferences(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["location"] {
  const jobLocation = job.location;
  const jobWorkType = job.work_type;
  const jobLocationLower = normalizeString(jobLocation ?? "");
  const isJobRemote = jobWorkType === "remote" || jobLocationLower.includes("remote");

  let bestScore = 0;
  let matchType: "exact" | "region" | "remote" | "relocation" | "mismatch" = "mismatch";

  for (const pref of seeker.location_preferences) {
    const prefWorkType = pref.work_type;
    const prefLocations = normalizeArray(pref.locations);

    if (prefWorkType === "remote") {
      if (isJobRemote) {
        bestScore = maxScore;
        matchType = "remote";
        break; // Can't do better than full score
      }
    } else {
      // hybrid or onsite preference
      if (jobWorkType === prefWorkType || (prefWorkType === "onsite" && jobWorkType === "on-site")) {
        // Check if job location matches any of this preference's locations
        const locationHit = prefLocations.some(
          (loc) =>
            jobLocationLower.includes(loc) ||
            loc.includes(jobLocationLower.split(",")[0])
        );
        if (locationHit) {
          bestScore = maxScore;
          matchType = "exact";
          break;
        }
      }
      // If seeker is open to hybrid/onsite but job is remote, still works (70%)
      if (isJobRemote) {
        const remoteScore = Math.round(maxScore * 0.7);
        if (remoteScore > bestScore) {
          bestScore = remoteScore;
          matchType = "remote";
        }
      }
    }
  }

  // Fall back to open_to_relocation if nothing matched
  if (bestScore === 0 && seeker.open_to_relocation) {
    bestScore = Math.round(maxScore * 0.4);
    matchType = "relocation";
  }

  return {
    score: bestScore,
    max: maxScore,
    details: {
      seeker_location: seeker.location,
      seeker_work_type: seeker.work_type,
      job_location: jobLocation,
      job_work_type: jobWorkType,
      match_type: matchType,
    },
  };
}

function scoreLocation(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["location"] {
  // Use new location_preferences if populated
  if (seeker.location_preferences && seeker.location_preferences.length > 0) {
    return scoreLocationWithPreferences(seeker, job, maxScore);
  }

  // Backward-compatible flat-field logic
  const seekerLocation = seeker.location;
  const seekerLocations = normalizeArray(seeker.preferred_locations);
  const seekerWorkType = seeker.work_type;
  const openToRelocation = seeker.open_to_relocation;

  const jobLocation = job.location;
  const jobWorkType = job.work_type;

  let score = 0;
  let matchType: "exact" | "region" | "remote" | "relocation" | "mismatch" =
    "mismatch";

  const jobLocationLower = normalizeString(jobLocation ?? "");
  const seekerLocationLower = normalizeString(seekerLocation ?? "");

  // Check work type compatibility first
  const isJobRemote = jobWorkType === "remote" || jobLocationLower.includes("remote");
  const seekerWantsRemote = seekerWorkType === "remote";

  if (isJobRemote) {
    // Remote job - good match for anyone
    score = maxScore;
    matchType = "remote";
  } else if (seekerWantsRemote && !isJobRemote && jobWorkType !== "hybrid") {
    // Seeker wants remote but job is on-site
    score = openToRelocation ? Math.round(maxScore * 0.4) : 0;
    matchType = "mismatch";
  } else {
    // Check location match
    const allSeekerLocations = [
      seekerLocationLower,
      ...seekerLocations.map(normalizeString),
    ].filter((l) => l.length > 0);

    const locationMatch = allSeekerLocations.some(
      (loc) =>
        jobLocationLower.includes(loc) ||
        loc.includes(jobLocationLower.split(",")[0])
    );

    if (locationMatch) {
      score = maxScore;
      matchType = "exact";
    } else if (openToRelocation) {
      score = Math.round(maxScore * 0.6);
      matchType = "relocation";
    } else if (jobWorkType === "hybrid" && seekerWorkType === "hybrid") {
      score = Math.round(maxScore * 0.5);
      matchType = "region";
    }
  }

  return {
    score,
    max: maxScore,
    details: {
      seeker_location: seekerLocation,
      seeker_work_type: seekerWorkType,
      job_location: jobLocation,
      job_work_type: jobWorkType,
      match_type: matchType,
    },
  };
}

function scoreCompanyFit(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["company_fit"] {
  const seekerIndustries = normalizeArray(seeker.preferred_industries);
  const seekerSizes = normalizeArray(seeker.preferred_company_sizes);

  const jobIndustry = job.industry ? normalizeString(job.industry) : null;
  const jobSize = job.company_size ? normalizeString(job.company_size) : null;

  const industryScore =
    seekerIndustries.length === 0
      ? 0.75
      : !jobIndustry
        ? 0.35
        : seekerIndustries.some(
            (industry) =>
              industry === jobIndustry ||
              industry.includes(jobIndustry) ||
              jobIndustry.includes(industry)
          )
          ? 1
          : 0;

  const sizeScore =
    seekerSizes.length === 0
      ? 0.75
      : !jobSize
        ? 0.35
        : seekerSizes.some(
            (size) =>
              size === jobSize ||
              size.includes(jobSize) ||
              jobSize.includes(size)
          )
          ? 1
          : 0;

  const score = Math.round(maxScore * ((industryScore + sizeScore) / 2));
  const industryMatch = industryScore >= 1;
  const sizeMatch = sizeScore >= 1;

  return {
    score,
    max: maxScore,
    details: {
      industry_match: industryMatch,
      size_match: sizeMatch,
      seeker_industries: seekerIndustries,
      job_industry: jobIndustry,
    },
  };
}

function scorePenalties(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxPenalty: number
): MatchScoreBreakdown["penalties"] {
  const excludeKeywords = normalizeArray(seeker.exclude_keywords);
  const combinedText = `${job.title} ${job.description_text ?? ""}`.toLowerCase();
  const titleAlignment = analyzeTitleAlignment(seeker.target_titles, job.title);

  const excludedFound: string[] = [];
  const reasons: string[] = [];

  // Check exclude keywords
  for (const keyword of excludeKeywords) {
    if (combinedText.includes(keyword)) {
      excludedFound.push(keyword);
      reasons.push(`exclude_keyword: ${keyword}`);
    }
  }

  // Check visa sponsorship mismatch
  let visaMismatch = false;
  if (seeker.requires_visa_sponsorship && job.offers_visa_sponsorship === false) {
    visaMismatch = true;
    reasons.push("visa_sponsorship_not_offered");
  }

  let titleMismatchPenalty = 0;
  if (titleAlignment.hardMismatch) {
    titleMismatchPenalty = 10;
    reasons.push("title_mismatch");
  } else if (
    seeker.target_titles.length > 0 &&
    !titleAlignment.exact &&
    !titleAlignment.partial &&
    titleAlignment.bestTokenOverlap === 0
  ) {
    titleMismatchPenalty = 4;
    reasons.push("weak_title_alignment");
  }

  // Calculate penalty
  let penalty = 0;
  penalty += excludedFound.length * 5;
  if (visaMismatch) penalty += 10;
  penalty += titleMismatchPenalty;
  penalty = Math.min(maxPenalty, penalty);

  return {
    score: -penalty,
    max: maxPenalty,
    details: {
      reasons,
      excluded_keywords_found: excludedFound,
      visa_mismatch: visaMismatch,
    },
  };
}

// ============================================================================
// CONFIDENCE & RECOMMENDATION
// ============================================================================

function determineConfidence(
  seeker: JobSeekerProfile,
  job: JobPost
): MatchConfidence {
  let dataPoints = 0;
  let totalPossible = 0;

  // Seeker data
  totalPossible += 7;
  if (seeker.skills.length > 0) dataPoints++;
  if (seeker.target_titles.length > 0) dataPoints++;
  if (seeker.location) dataPoints++;
  if (seeker.salary_min || seeker.salary_max) dataPoints++;
  if (seeker.years_experience !== null) dataPoints++;
  if (seeker.work_type) dataPoints++;
  if (seeker.seniority) dataPoints++;

  // Job data
  totalPossible += 7;
  if (job.required_skills.length > 0 || job.preferred_skills.length > 0) dataPoints++;
  if (job.salary_min || job.salary_max) dataPoints++;
  if (job.years_experience_min !== null) dataPoints++;
  if (job.work_type) dataPoints++;
  if (job.seniority_level) dataPoints++;
  if (job.industry) dataPoints++;
  if (job.description_text && job.description_text.length > 200) dataPoints++;

  const ratio = dataPoints / totalPossible;

  if (ratio >= 0.7) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

function determineRecommendation(
  score: number,
  confidence: MatchConfidence
): MatchRecommendation {
  // Adjust thresholds based on confidence
  const adjustedScore =
    confidence === "low" ? score * 0.9 : confidence === "medium" ? score * 0.95 : score;

  if (adjustedScore >= 75) return "strong_match";
  if (adjustedScore >= 55) return "good_match";
  if (adjustedScore >= 40) return "marginal";
  return "poor_fit";
}

// ============================================================================
// MAIN SCORING FUNCTION
// ============================================================================

export function computeMatchScore(
  seeker: JobSeekerProfile,
  job: JobPost,
  weights: ScoringWeights = {
    skills: 35,
    title: 20,
    experience: 10,
    salary: 10,
    location: 15,
    company_fit: 10,
    max_penalty: 15,
  }
): MatchResult {
  // Compute each component
  const skillsResult = scoreSkills(seeker, job, weights.skills);
  const titleResult = scoreTitle(seeker, job, weights.title);
  const experienceResult = scoreExperience(seeker, job, weights.experience);
  const salaryResult = scoreSalary(seeker, job, weights.salary);
  const locationResult = scoreLocation(seeker, job, weights.location);
  const companyFitResult = scoreCompanyFit(seeker, job, weights.company_fit);
  const penaltiesResult = scorePenalties(seeker, job, weights.max_penalty);
  const titleAlignment = analyzeTitleAlignment(seeker.target_titles, job.title);

  // Calculate total score
  let rawScore =
    skillsResult.score +
    titleResult.score +
    experienceResult.score +
    salaryResult.score +
    locationResult.score +
    companyFitResult.score +
    penaltiesResult.score; // penalties are negative

  const hasStructuredSkills =
    job.required_skills.length > 0 || job.preferred_skills.length > 0;

  if (titleAlignment.hardMismatch) {
    const mismatchCap =
      hasStructuredSkills && skillsResult.score >= Math.round(weights.skills * 0.5)
        ? 54
        : 49;
    rawScore = Math.min(rawScore, mismatchCap);
  }

  const score = Math.max(0, Math.min(100, rawScore));

  const confidence = determineConfidence(seeker, job);
  const recommendation = determineRecommendation(score, confidence);

  const componentScores: MatchScoreBreakdown = {
    skills: skillsResult,
    title: titleResult,
    experience: experienceResult,
    salary: salaryResult,
    location: locationResult,
    company_fit: companyFitResult,
    penalties: penaltiesResult,
  };

  // Build legacy reasons object for backward compatibility
  const reasons = {
    matched_skills: [
      ...skillsResult.details.matched_required,
      ...skillsResult.details.matched_preferred,
    ],
    missing_skills: skillsResult.details.missing_required,
    title_hits: titleResult.details.matched_titles,
  };

  return {
    score,
    confidence,
    recommendation,
    component_scores: componentScores,
    reasons,
  };
}
