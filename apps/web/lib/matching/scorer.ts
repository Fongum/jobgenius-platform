/**
 * Intelligent Job Match Scoring Algorithm
 *
 * Computes a comprehensive match score between a job seeker and a job posting
 * based on multiple weighted factors.
 */

import type {
  JobSeekerProfile,
  JobPost,
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
  const targetTitles = normalizeArray(seeker.target_titles);
  const jobTitle = normalizeString(job.title);

  const matchedTitles: string[] = [];
  const partialMatches: string[] = [];

  for (const target of targetTitles) {
    if (jobTitle.includes(target)) {
      matchedTitles.push(target);
    } else {
      // Check for partial matches (e.g., "software engineer" matches "senior software engineer")
      const targetWords = target.split(/\s+/);
      const titleWords = jobTitle.split(/\s+/);
      const matchedWords = targetWords.filter((tw) =>
        titleWords.some((jw) => jw.includes(tw) || tw.includes(jw))
      );

      if (matchedWords.length >= Math.ceil(targetWords.length * 0.6)) {
        partialMatches.push(target);
      }
    }
  }

  let score = 0;
  if (matchedTitles.length > 0) {
    score = maxScore;
  } else if (partialMatches.length > 0) {
    score = Math.round(maxScore * 0.6);
  }

  return {
    score,
    max: maxScore,
    details: {
      matched_titles: matchedTitles,
      partial_matches: partialMatches,
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
    // Can't determine, give partial credit
    score = Math.round(maxScore * 0.5);
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
    score = Math.round(maxScore * 0.5);
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

function scoreLocation(
  seeker: JobSeekerProfile,
  job: JobPost,
  maxScore: number
): MatchScoreBreakdown["location"] {
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

  let industryMatch = false;
  let sizeMatch = false;

  // Industry matching
  if (seekerIndustries.length === 0) {
    industryMatch = true; // No preference means any industry is fine
  } else if (jobIndustry) {
    industryMatch = seekerIndustries.includes(jobIndustry);
  } else {
    industryMatch = true; // Unknown industry, give benefit of doubt
  }

  // Size matching
  if (seekerSizes.length === 0) {
    sizeMatch = true;
  } else if (jobSize) {
    sizeMatch = seekerSizes.includes(jobSize);
  } else {
    sizeMatch = true;
  }

  let score = 0;
  if (industryMatch && sizeMatch) {
    score = maxScore;
  } else if (industryMatch || sizeMatch) {
    score = Math.round(maxScore * 0.5);
  }

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

  // Calculate penalty
  let penalty = 0;
  penalty += excludedFound.length * 5;
  if (visaMismatch) penalty += 10;
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

  // Calculate total score
  const rawScore =
    skillsResult.score +
    titleResult.score +
    experienceResult.score +
    salaryResult.score +
    locationResult.score +
    companyFitResult.score +
    penaltiesResult.score; // penalties are negative

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
