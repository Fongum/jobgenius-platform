type InterviewPrepContent = {
  role_summary: string;
  company_notes: string[];
  likely_questions: string[];
  answer_structure: string[];
  technical_topics: string[];
  behavioral_topics: string[];
  checklist: string[];
};

export function buildInterviewPrepContent({
  jobTitle,
  companyName,
  descriptionText,
  location,
  seniority,
  workType,
}: {
  jobTitle: string;
  companyName?: string | null;
  descriptionText?: string | null;
  location?: string | null;
  seniority?: string | null;
  workType?: string | null;
}): InterviewPrepContent {
  const roleSummary = [
    `${jobTitle} role`,
    companyName ? `at ${companyName}` : "",
    location ? `(${location})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const companyNotes = [
    companyName ? `Review ${companyName}'s recent news and product updates.` : "Review company news and product updates.",
    "Understand the team structure and how this role supports business goals.",
  ];

  const likelyQuestions = [
    "Walk me through your background and why you are interested in this role.",
    "Describe a project where you delivered measurable impact.",
    "How do you prioritize work when requirements change?",
  ];

  const answerStructure = [
    "Situation: set the context.",
    "Task: clarify the responsibility.",
    "Action: explain what you did.",
    "Result: quantify the outcome.",
  ];

  const technicalTopics = [
    "Core tools and stack listed in the job description.",
    "System design or process questions tailored to the role level.",
  ];

  const behavioralTopics = [
    "Collaboration and cross-functional communication.",
    "Handling conflict or ambiguous requirements.",
  ];

  if (descriptionText && descriptionText.trim().length > 0) {
    likelyQuestions.push("What stood out to you in the job description?");
  }

  if (seniority) {
    technicalTopics.push(`Expect ${seniority.toLowerCase()}-level depth in discussions.`);
  }

  if (workType) {
    behavioralTopics.push(`Prepare for questions about ${workType.toLowerCase()} work habits.`);
  }

  const checklist = [
    "Review the job description and highlight required skills.",
    "Prepare 2-3 concise success stories.",
    "Draft questions for the interviewer.",
    "Confirm logistics and interview format.",
  ];

  return {
    role_summary: roleSummary,
    company_notes: companyNotes,
    likely_questions: likelyQuestions,
    answer_structure: answerStructure,
    technical_topics: technicalTopics,
    behavioral_topics: behavioralTopics,
    checklist,
  };
}
