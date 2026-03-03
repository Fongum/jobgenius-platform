/**
 * Test script for the intelligent matching algorithm
 * Run with: npx ts-node --esm lib/matching/test-scoring.ts
 * Or: npx tsx lib/matching/test-scoring.ts
 */

import { computeMatchScore, parseJobPost } from "./index";
import type { JobSeekerProfile, JobPost } from "./types";

// ============================================================================
// TEST DATA
// ============================================================================

const sampleSeeker: JobSeekerProfile = {
  id: "test-seeker-1",
  location: "San Francisco",
  seniority: "senior",
  salary_min: 150000,
  salary_max: 200000,
  work_type: "remote",
  target_titles: ["Software Engineer", "Senior Software Engineer", "Full Stack Developer"],
  skills: ["typescript", "react", "node.js", "postgresql", "aws", "docker", "graphql"],
  resume_text: null,
  match_threshold: 60,
  preferred_industries: ["technology", "finance"],
  preferred_company_sizes: ["startup", "mid-size"],
  exclude_keywords: ["clearance required", "on-site only"],
  years_experience: 7,
  preferred_locations: ["San Francisco", "New York", "Remote"],
  open_to_relocation: false,
  requires_visa_sponsorship: false,
  location_preferences: [],
};

const goodMatchJob: JobPost = {
  id: "job-1",
  url: "https://example.com/job/1",
  title: "Senior Software Engineer",
  company: "TechStartup Inc",
  location: "Remote",
  description_text: `
    We're looking for a Senior Software Engineer to join our growing team!

    Requirements:
    - 5+ years of experience in software development
    - Strong proficiency in TypeScript and React
    - Experience with Node.js and PostgreSQL
    - Familiarity with AWS services
    - Docker and containerization experience

    Nice to have:
    - GraphQL experience
    - Experience with CI/CD pipelines

    Compensation: $160k - $190k

    This is a fully remote position.
  `,
  salary_min: 160000,
  salary_max: 190000,
  seniority_level: "senior",
  work_type: "remote",
  years_experience_min: 5,
  years_experience_max: 8,
  required_skills: ["typescript", "react", "node.js", "postgresql", "aws", "docker"],
  preferred_skills: ["graphql", "ci/cd"],
  industry: "technology",
  company_size: "startup",
  offers_visa_sponsorship: null,
  employment_type: "full-time",
  parsed_at: new Date().toISOString(),
};

const marginalMatchJob: JobPost = {
  id: "job-2",
  url: "https://example.com/job/2",
  title: "Junior Developer",
  company: "BigCorp",
  location: "New York, NY (Hybrid)",
  description_text: `
    Entry-level developer position.

    Requirements:
    - 1-2 years experience
    - JavaScript knowledge
    - HTML/CSS

    Salary: $70k - $90k

    This is a hybrid position requiring 3 days in office.
  `,
  salary_min: 70000,
  salary_max: 90000,
  seniority_level: "entry",
  work_type: "hybrid",
  years_experience_min: 1,
  years_experience_max: 2,
  required_skills: ["javascript", "html", "css"],
  preferred_skills: [],
  industry: "technology",
  company_size: "enterprise",
  offers_visa_sponsorship: null,
  employment_type: "full-time",
  parsed_at: new Date().toISOString(),
};

const poorMatchJob: JobPost = {
  id: "job-3",
  url: "https://example.com/job/3",
  title: "DevOps Manager",
  company: "GovernmentContractor",
  location: "Washington DC (On-site only)",
  description_text: `
    DevOps Manager position requiring security clearance.

    Requirements:
    - 10+ years experience
    - Active security clearance required
    - On-site only
    - Java and Jenkins expertise

    Salary: $180k - $220k

    Must be US citizen. No visa sponsorship available.
  `,
  salary_min: 180000,
  salary_max: 220000,
  seniority_level: "manager",
  work_type: "on-site",
  years_experience_min: 10,
  years_experience_max: null,
  required_skills: ["java", "jenkins", "security clearance"],
  preferred_skills: [],
  industry: null,
  company_size: "enterprise",
  offers_visa_sponsorship: false,
  employment_type: "full-time",
  parsed_at: new Date().toISOString(),
};

const obviousMismatchJob: JobPost = {
  id: "job-4",
  url: "https://example.com/job/4",
  title: "Brand & Content Manager",
  company: "MarketingCo",
  location: "Remote",
  description_text: `
    We're hiring a Brand & Content Manager to lead campaigns, brand voice, and content planning.

    Requirements:
    - Content marketing experience
    - Brand strategy
    - Campaign planning
    - Social media coordination
  `,
  salary_min: null,
  salary_max: null,
  seniority_level: "mid",
  work_type: "remote",
  years_experience_min: null,
  years_experience_max: null,
  required_skills: [],
  preferred_skills: [],
  industry: null,
  company_size: null,
  offers_visa_sponsorship: null,
  employment_type: "full-time",
  parsed_at: new Date().toISOString(),
};

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTests() {
  console.log("=".repeat(70));
  console.log("INTELLIGENT MATCH SCORING TEST");
  console.log("=".repeat(70));
  console.log("");

  // Test 1: Good Match
  console.log("TEST 1: Good Match (Senior SWE at Remote Startup)");
  console.log("-".repeat(50));
  const goodResult = computeMatchScore(sampleSeeker, goodMatchJob);
  printResult(goodResult);
  console.log("");

  // Test 2: Marginal Match
  console.log("TEST 2: Marginal Match (Junior Dev at Enterprise)");
  console.log("-".repeat(50));
  const marginalResult = computeMatchScore(sampleSeeker, marginalMatchJob);
  printResult(marginalResult);
  console.log("");

  // Test 3: Poor Match
  console.log("TEST 3: Poor Match (DevOps Manager, Clearance Required)");
  console.log("-".repeat(50));
  const poorResult = computeMatchScore(sampleSeeker, poorMatchJob);
  printResult(poorResult);
  console.log("");

  // Test 4: Obvious title mismatch
  console.log("TEST 4: Obvious Title Mismatch (Brand & Content Manager)");
  console.log("-".repeat(50));
  const mismatchResult = computeMatchScore(sampleSeeker, obviousMismatchJob);
  printResult(mismatchResult);
  console.log("");

  // Test 5: Job Post Parsing
  console.log("TEST 5: Job Description Parsing");
  console.log("-".repeat(50));
  const rawDescription = `
    Senior Full Stack Engineer - $150k-$180k

    About Us:
    We're a fast-growing fintech startup looking for experienced engineers.

    Requirements:
    - 5+ years of experience in web development
    - Proficiency in Python, JavaScript, and TypeScript
    - Experience with React and Django
    - Familiarity with PostgreSQL and Redis
    - AWS or GCP experience

    Nice to Have:
    - Kubernetes experience
    - Machine learning background

    Benefits:
    - Fully remote work
    - Competitive salary
    - Equity package

    We provide visa sponsorship for qualified candidates.
  `;

  const parsed = parseJobPost(
    "Senior Full Stack Engineer",
    "FinTech Startup",
    "Remote",
    rawDescription
  );

  console.log("Parsed Data:");
  console.log(`  Salary: $${parsed.salary_min?.toLocaleString()} - $${parsed.salary_max?.toLocaleString()}`);
  console.log(`  Seniority: ${parsed.seniority_level}`);
  console.log(`  Work Type: ${parsed.work_type}`);
  console.log(`  Experience: ${parsed.years_experience_min}+ years`);
  console.log(`  Industry: ${parsed.industry}`);
  console.log(`  Company Size: ${parsed.company_size}`);
  console.log(`  Visa Sponsorship: ${parsed.offers_visa_sponsorship}`);
  console.log(`  Required Skills: ${parsed.required_skills.join(", ")}`);
  console.log(`  Preferred Skills: ${parsed.preferred_skills.join(", ")}`);
  console.log("");

  // Summary
  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`Good Match:     Score ${goodResult.score}/100 (${goodResult.recommendation})`);
  console.log(`Marginal Match: Score ${marginalResult.score}/100 (${marginalResult.recommendation})`);
  console.log(`Poor Match:     Score ${poorResult.score}/100 (${poorResult.recommendation})`);
  console.log(`Title Mismatch: Score ${mismatchResult.score}/100 (${mismatchResult.recommendation})`);
  console.log("");

  // Assertions
  const passed = [];
  const failed = [];

  if (goodResult.score >= 70) {
    passed.push("Good match scores >= 70");
  } else {
    failed.push(`Good match should score >= 70, got ${goodResult.score}`);
  }

  if (marginalResult.score >= 30 && marginalResult.score < 60) {
    passed.push("Marginal match scores 30-60");
  } else {
    failed.push(`Marginal match should score 30-60, got ${marginalResult.score}`);
  }

  if (poorResult.score < 40) {
    passed.push("Poor match scores < 40");
  } else {
    failed.push(`Poor match should score < 40, got ${poorResult.score}`);
  }

  if (mismatchResult.score < 50) {
    passed.push("Obvious title mismatch stays below 50");
  } else {
    failed.push(`Obvious title mismatch should score < 50, got ${mismatchResult.score}`);
  }

  if (goodResult.recommendation === "strong_match" || goodResult.recommendation === "good_match") {
    passed.push("Good match gets positive recommendation");
  } else {
    failed.push(`Good match should get positive recommendation, got ${goodResult.recommendation}`);
  }

  if (poorResult.recommendation === "poor_fit" || poorResult.recommendation === "marginal") {
    passed.push("Poor match gets negative recommendation");
  } else {
    failed.push(`Poor match should get negative recommendation, got ${poorResult.recommendation}`);
  }

  console.log("ASSERTIONS:");
  for (const p of passed) {
    console.log(`  ✓ ${p}`);
  }
  for (const f of failed) {
    console.log(`  ✗ ${f}`);
  }
  console.log("");
  console.log(`Result: ${passed.length}/${passed.length + failed.length} passed`);
}

function printResult(result: ReturnType<typeof computeMatchScore>) {
  console.log(`Score: ${result.score}/100`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`Recommendation: ${result.recommendation}`);
  console.log("");
  console.log("Component Scores:");

  const cs = result.component_scores;
  console.log(`  Skills:      ${cs.skills.score}/${cs.skills.max} (${cs.skills.details.coverage_pct}% coverage)`);
  console.log(`  Title:       ${cs.title.score}/${cs.title.max} (matched: ${cs.title.details.matched_titles.join(", ") || "none"})`);
  console.log(`  Experience:  ${cs.experience.score}/${cs.experience.max} (${cs.experience.details.match_type})`);
  console.log(`  Salary:      ${cs.salary.score}/${cs.salary.max} (${cs.salary.details.overlap_pct}% overlap)`);
  console.log(`  Location:    ${cs.location.score}/${cs.location.max} (${cs.location.details.match_type})`);
  console.log(`  Company Fit: ${cs.company_fit.score}/${cs.company_fit.max}`);
  console.log(`  Penalties:   ${cs.penalties.score} (${cs.penalties.details.reasons.join(", ") || "none"})`);
}

// Run if executed directly
runTests();
