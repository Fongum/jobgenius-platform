type InterviewPrepContent = {
  role_summary: string;
  company_notes: string[];
  likely_questions: string[];
  answer_structure: string[];
  technical_topics: string[];
  behavioral_topics: string[];
  checklist: string[];
  thirty_sixty_ninety: string[];
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
    "Tell me about a time you solved a difficult technical problem.",
    "How do you collaborate with cross-functional partners?",
    "What excites you about this team and mission?",
    "How do you handle competing priorities and deadlines?",
    "Describe a time you improved a process or system.",
    "How do you scope and estimate work?",
    "What tradeoffs did you make on a recent project?",
    "How do you debug production issues?",
    "Tell me about a time you mentored or led others.",
    "How do you learn new tools quickly?",
    "What metrics do you use to measure success?",
    "How do you balance quality and speed?",
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

  if (descriptionText) {
    const tokens = descriptionText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 4);
    const keywordCounts = new Map<string, number>();
    for (const token of tokens) {
      keywordCounts.set(token, (keywordCounts.get(token) ?? 0) + 1);
    }
    const keywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token]) => token);
    if (keywords.length > 0) {
      technicalTopics.push(`Focus on: ${keywords.join(", ")}.`);
    }
    keywords.forEach((keyword) => {
      likelyQuestions.push(`Describe your experience with ${keyword}.`);
    });
  }

  while (likelyQuestions.length < 15) {
    likelyQuestions.push("Tell me about a challenge you faced and how you handled it.");
  }

  if (likelyQuestions.length > 25) {
    likelyQuestions.splice(25);
  }

  const checklist = [
    "Review the job description and highlight required skills.",
    "Prepare 2-3 concise success stories.",
    "Draft questions for the interviewer.",
    "Confirm logistics and interview format.",
  ];

  const thirtySixtyNinety = [
    "30 days: What would you focus on learning and delivering first?",
    "60 days: What early wins would you target?",
    "90 days: How would you measure success and impact?",
  ];

  return {
    role_summary: roleSummary,
    company_notes: companyNotes,
    likely_questions: likelyQuestions,
    answer_structure: answerStructure,
    technical_topics: technicalTopics,
    behavioral_topics: behavioralTopics,
    checklist,
    thirty_sixty_ninety: thirtySixtyNinety,
  };
}
