export function scorePracticeAnswer(
  question: string,
  userAnswer: string
): { score: number; feedback: string } {
  if (!userAnswer.trim()) {
    return { score: 0, feedback: "No answer provided." };
  }

  const words = userAnswer.trim().split(/\s+/);
  const wordCount = words.length;

  // Check for STAR method indicators
  const starKeywords = ["situation", "task", "action", "result", "outcome", "impact"];
  const hasStarStructure = starKeywords.filter((kw) =>
    userAnswer.toLowerCase().includes(kw)
  ).length;

  // Check for specificity indicators
  const specificityMarkers = [
    /\d+/,              // numbers / metrics
    /percent|%/i,       // percentages
    /increased|reduced|improved|built|created|led|managed/i,  // action verbs
    /team|project|client|stakeholder/i,  // context words
  ];
  const specificityScore = specificityMarkers.filter((rx) =>
    rx.test(userAnswer)
  ).length;

  let score = 0;
  let feedback = "";

  if (wordCount < 10) {
    score = 15;
    feedback = "Your answer is very brief. Try to provide more detail with specific examples.";
  } else if (wordCount < 30) {
    score = 35 + specificityScore * 5 + hasStarStructure * 5;
    feedback = "Good start, but try to elaborate with concrete examples and measurable outcomes.";
  } else if (wordCount < 60) {
    score = 55 + specificityScore * 5 + hasStarStructure * 5;
    feedback = "Solid answer. Consider structuring it using the STAR method (Situation, Task, Action, Result) for even more impact.";
  } else if (wordCount < 120) {
    score = 70 + specificityScore * 4 + hasStarStructure * 3;
    feedback = "Detailed response. Make sure to highlight the specific impact and results of your actions.";
  } else {
    score = 80 + specificityScore * 3 + hasStarStructure * 2;
    feedback = "Comprehensive answer. In a real interview, aim to keep responses concise while hitting the key points.";
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, feedback };
}

export function calculateOverallScore(
  questions: Array<{ score?: number | null }>
): number {
  const scored = questions.filter((q) => q.score !== undefined && q.score !== null);
  if (scored.length === 0) return 0;
  const total = scored.reduce((sum, q) => sum + (q.score ?? 0), 0);
  return Math.round(total / scored.length);
}
