export type ProfileField = {
  key: string;
  label: string;
  weight: number;
  isFilled: (jobSeeker: Record<string, unknown>) => boolean;
};

export const PROFILE_FIELDS: ProfileField[] = [
  { key: "full_name", label: "Full Name", weight: 10, isFilled: (js) => !!js.full_name },
  { key: "phone", label: "Phone Number", weight: 5, isFilled: (js) => !!js.phone },
  { key: "location", label: "Location", weight: 8, isFilled: (js) => !!js.location },
  { key: "linkedin_url", label: "LinkedIn", weight: 5, isFilled: (js) => !!js.linkedin_url },
  { key: "seniority", label: "Seniority Level", weight: 8, isFilled: (js) => !!js.seniority },
  { key: "work_type", label: "Work Type Preference", weight: 6, isFilled: (js) => !!js.work_type },
  { key: "salary_range", label: "Target Salary Range", weight: 6, isFilled: (js) => !!(js.salary_min && js.salary_max) },
  { key: "target_titles", label: "Target Job Titles", weight: 8, isFilled: (js) => Array.isArray(js.target_titles) && js.target_titles.length > 0 },
  { key: "skills", label: "Skills", weight: 10, isFilled: (js) => Array.isArray(js.skills) && js.skills.length > 0 },
  { key: "work_history", label: "Work History", weight: 10, isFilled: (js) => Array.isArray(js.work_history) && js.work_history.length > 0 },
  { key: "education", label: "Education", weight: 8, isFilled: (js) => Array.isArray(js.education) && js.education.length > 0 },
  { key: "resume_text", label: "Resume", weight: 10, isFilled: (js) => !!js.resume_text },
  { key: "years_experience", label: "Years of Experience", weight: 3, isFilled: (js) => js.years_experience != null },
  { key: "preferred_industries", label: "Preferred Industries", weight: 3, isFilled: (js) => Array.isArray(js.preferred_industries) && js.preferred_industries.length > 0 },
];

export function calculateProfileCompletion(jobSeeker: Record<string, unknown>) {
  const totalWeight = PROFILE_FIELDS.reduce((sum, f) => sum + f.weight, 0);
  const filledWeight = PROFILE_FIELDS
    .filter((f) => f.isFilled(jobSeeker))
    .reduce((sum, f) => sum + f.weight, 0);

  return {
    percentage: Math.round((filledWeight / totalWeight) * 100),
    missingFields: PROFILE_FIELDS.filter((f) => !f.isFilled(jobSeeker)),
    completedFields: PROFILE_FIELDS.filter((f) => f.isFilled(jobSeeker)),
  };
}
