/**
 * Intelligent Job Matching Module
 *
 * Provides comprehensive job-seeker matching based on:
 * - Skills overlap (required vs preferred)
 * - Title/seniority alignment
 * - Location/remote preferences
 * - Salary band fit
 * - Company size/industry preferences
 * - Negative keyword filtering
 * - Visa sponsorship requirements
 */

export * from "./types";
export * from "./extractors";
export * from "./scorer";
export * from "./skill-hierarchy";
export * from "./resume-extractor";

// Re-export main functions for convenience
export { computeMatchScore } from "./scorer";
export { parseJobPost } from "./extractors";
export { hierarchicalSkillMatch, skillSimilarity, resolveSkill } from "./skill-hierarchy";
export { extractResumeSignals, computeResumeBonus } from "./resume-extractor";
