const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "you",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  "our",
  "their",
  "they",
  "them",
  "into",
  "about",
  "what",
  "when",
  "where",
  "which",
  "while",
  "why",
  "how",
  "role",
  "team",
  "project",
  "work",
  "job",
  "company",
  "position",
  "experience",
]);

const ACTION_VERBS = [
  "led",
  "built",
  "created",
  "implemented",
  "designed",
  "launched",
  "owned",
  "improved",
  "delivered",
  "optimized",
  "reduced",
  "increased",
  "analyzed",
  "collaborated",
  "managed",
  "drove",
  "shipped",
  "refactored",
  "debugged",
];

const HEDGE_PHRASES = [
  "i think",
  "maybe",
  "probably",
  "sort of",
  "kind of",
  "i guess",
  "hopefully",
  "i feel",
  "might",
  "could be",
  "somewhat",
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function extractKeywords(text: string, limit = 4): string[] {
  const tokens = tokenize(text);
  const unique = Array.from(new Set(tokens));
  return unique.slice(0, limit);
}

function detectStarComponents(answer: string) {
  const lower = answer.toLowerCase();
  const situation = /situation|context|when|while|during|at the time|in my role|on a project/.test(lower);
  const task = /task|responsibility|goal|objective|needed to|had to|my role was/.test(lower);
  const action = /i (led|built|created|implemented|designed|launched|owned|improved|delivered|analyzed|collaborated|managed|drove|optimized|shipped|refactored|debugged)/.test(lower);
  const result = /result|outcome|impact|led to|increased|decreased|reduced|improved|saved|grew|%|percent|revenue|cost|latency|throughput|users|customer/.test(lower);
  return { situation, task, action, result };
}

function scoreStar(answer: string, wordCount: number) {
  const components = detectStarComponents(answer);
  const count = Object.values(components).filter(Boolean).length;
  let score = Math.round((count / 4) * 100);
  if (wordCount < 25) score = Math.min(score, 55);
  return { score, components };
}

function scoreRelevance(question: string, answer: string, wordCount: number) {
  const questionTokens = tokenize(question);
  if (questionTokens.length === 0) {
    return 70;
  }
  const answerTokens = new Set(tokenize(answer));
  const overlap = questionTokens.filter((token) => answerTokens.has(token));
  const ratio = overlap.length / questionTokens.length;
  let score = Math.round((0.2 + ratio * 0.8) * 100);
  if (wordCount < 20) score = Math.min(score, 60);
  return Math.min(score, 100);
}

function scoreSpecificity(answer: string, wordCount: number) {
  const lower = answer.toLowerCase();
  const numericMatches = answer.match(/\b\d+(\.\d+)?\b/g) ?? [];
  const percentMatches = /%|percent/.test(lower) ? 1 : 0;
  const verbHits = ACTION_VERBS.filter((verb) => lower.includes(verb)).length;
  const timeMarkers = /day|week|month|quarter|year|sprint|deadline|timeline|within|roadmap/.test(lower);
  const scopeMarkers = /users|customers|revenue|budget|cost|latency|throughput|pipeline|bugs|tickets|conversion|uptime|sla/.test(lower);

  let score = 0;
  score += Math.min(numericMatches.length + percentMatches, 3) * 15;
  score += Math.min(verbHits, 4) * 8;
  if (timeMarkers) score += 10;
  if (scopeMarkers) score += 10;
  if (wordCount >= 30) score += 10;
  if (wordCount >= 60) score += 10;
  return Math.min(score, 100);
}

function countHedges(answer: string) {
  const lower = answer.toLowerCase();
  return HEDGE_PHRASES.reduce((sum, phrase) => sum + (lower.includes(phrase) ? 1 : 0), 0);
}

function buildConfidenceCoaching({
  starScore,
  relevanceScore,
  specificityScore,
  hedgeCount,
  components,
}: {
  starScore: number;
  relevanceScore: number;
  specificityScore: number;
  hedgeCount: number;
  components: { situation: boolean; task: boolean; action: boolean; result: boolean };
}) {
  const coaching: string[] = [];
  if (hedgeCount > 0) {
    coaching.push("Trim hedging language and lead with confident, direct statements.");
  }
  if (!components.result) {
    coaching.push("Close with a clear result line that quantifies impact.");
  }
  if (relevanceScore < 60) {
    coaching.push("Anchor the first sentence to the question to signal relevance.");
  }
  if (specificityScore < 60) {
    coaching.push("Add concrete metrics, scope, or scale to sound more authoritative.");
  }
  if (coaching.length === 0) {
    coaching.push("Strong, confident delivery. Keep the direct tone and lead with impact.");
  }
  return coaching.slice(0, 2).join(" ");
}

function buildRewriteSuggestions({
  wordCount,
  relevanceScore,
  specificityScore,
  hedgeCount,
  components,
  question,
}: {
  wordCount: number;
  relevanceScore: number;
  specificityScore: number;
  hedgeCount: number;
  components: { situation: boolean; task: boolean; action: boolean; result: boolean };
  question: string;
}) {
  const suggestions: string[] = [];
  if (!components.result) {
    suggestions.push("End with a Result sentence that quantifies impact (%, $, time saved, scale).");
  }
  if (!components.action) {
    suggestions.push("Add 1-2 action verbs that show what you personally did.");
  }
  if (specificityScore < 60) {
    suggestions.push("Include metrics or scope (users, revenue, latency, timeline) to make impact concrete.");
  }
  if (relevanceScore < 60) {
    const keywords = extractKeywords(question, 3);
    if (keywords.length > 0) {
      suggestions.push(`Echo the question keywords: ${keywords.join(", ")}.`);
    }
  }
  if (wordCount > 140) {
    suggestions.push("Tighten to 3-5 sentences (roughly 60-90 seconds spoken).");
  }
  if (wordCount < 25) {
    suggestions.push("Add more context about the project, your role, and the outcome.");
  }
  if (hedgeCount > 0) {
    suggestions.push("Replace hedges with confident verbs like led, built, delivered.");
  }

  return Array.from(new Set(suggestions)).slice(0, 3);
}

export function scorePracticeAnswer(
  question: string,
  userAnswer: string
): {
  score: number;
  feedback: string;
  star_score: number;
  relevance_score: number;
  specificity_score: number;
  confidence_coaching: string;
  rewrite_suggestions: string[];
} {
  if (!userAnswer.trim()) {
    return {
      score: 0,
      feedback: "No answer provided.",
      star_score: 0,
      relevance_score: 0,
      specificity_score: 0,
      confidence_coaching: "Provide an answer to unlock coaching.",
      rewrite_suggestions: ["Answer the question using the STAR format."],
    };
  }

  const words = userAnswer.trim().split(/\s+/);
  const wordCount = words.length;
  const { score: starScore, components } = scoreStar(userAnswer, wordCount);
  const relevanceScore = scoreRelevance(question, userAnswer, wordCount);
  const specificityScore = scoreSpecificity(userAnswer, wordCount);
  const hedgeCount = countHedges(userAnswer);

  let score = Math.round(starScore * 0.4 + relevanceScore * 0.3 + specificityScore * 0.3);
  if (wordCount < 20) score = Math.min(score, 45);
  if (wordCount > 180) score = Math.min(score, 85);
  score = Math.min(Math.max(score, 0), 100);

  const feedbackParts: string[] = [];
  if (starScore < 70) feedbackParts.push("Strengthen STAR structure.");
  if (relevanceScore < 70) feedbackParts.push("Tie back to the question keywords.");
  if (specificityScore < 70) feedbackParts.push("Add measurable impact.");
  if (feedbackParts.length === 0) {
    feedbackParts.push("Strong answer with clear impact.");
  }

  return {
    score,
    feedback: feedbackParts.join(" "),
    star_score: starScore,
    relevance_score: relevanceScore,
    specificity_score: specificityScore,
    confidence_coaching: buildConfidenceCoaching({
      starScore,
      relevanceScore,
      specificityScore,
      hedgeCount,
      components,
    }),
    rewrite_suggestions: buildRewriteSuggestions({
      wordCount,
      relevanceScore,
      specificityScore,
      hedgeCount,
      components,
      question,
    }),
  };
}

export function calculateOverallScore(
  questions: Array<{ score?: number | null }>
): number {
  const scored = questions.filter((q) => q.score !== undefined && q.score !== null);
  if (scored.length === 0) return 0;
  const total = scored.reduce((sum, q) => sum + (q.score ?? 0), 0);
  return Math.round(total / scored.length);
}
