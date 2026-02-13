import {
  getOpenAIClient,
  OPENAI_MODEL,
  isOpenAIConfigured,
} from "@/lib/openai";
import { scorePracticeAnswer } from "@/lib/portal/practice-scoring";

type ScoreResult = {
  score: number;
  feedback: string;
  star_score: number;
  relevance_score: number;
  specificity_score: number;
  confidence_coaching: string;
  rewrite_suggestions: string[];
};

export function isAIScoringAvailable(): boolean {
  return isOpenAIConfigured();
}

export async function scoreWithAI({
  question,
  userAnswer,
  jobTitle,
  companyName,
  jobDescription,
}: {
  question: string;
  userAnswer: string;
  jobTitle?: string | null;
  companyName?: string | null;
  jobDescription?: string | null;
}): Promise<ScoreResult> {
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

  try {
    const client = getOpenAIClient();

    const jobContext = [
      jobTitle ? `Job title: ${jobTitle}` : null,
      companyName ? `Company: ${companyName}` : null,
      jobDescription
        ? `Job description excerpt: ${jobDescription.slice(0, 1500)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert interview coach. Evaluate the candidate's answer to an interview question using the STAR framework (Situation, Task, Action, Result).

Return a JSON object with exactly these fields:
- "score": overall score 0-100 (weighted: 40% STAR structure, 30% relevance to question, 30% specificity and metrics)
- "star_score": 0-100 how well the answer follows STAR structure
- "relevance_score": 0-100 how directly the answer addresses the question asked
- "specificity_score": 0-100 how specific the answer is (metrics, numbers, concrete details, scope)
- "feedback": 1-2 sentence actionable coaching feedback (be specific about what to improve, not generic)
- "confidence_coaching": 1-2 sentence advice on delivery tone and confidence (address hedging language, directness, authority)
- "rewrite_suggestions": array of 1-3 specific rewrite suggestions to strengthen the answer

Score rigorously: 90+ is exceptional with clear metrics and impact, 70-89 is solid with room for improvement, 50-69 needs significant work, below 50 is weak.

${jobContext ? `\nJob context:\n${jobContext}` : ""}

Tailor feedback to the specific role and company when context is available.`,
        },
        {
          role: "user",
          content: `Interview question: ${question}\n\nCandidate's answer: ${userAnswer}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return scorePracticeAnswer(question, userAnswer);
    }

    const parsed = JSON.parse(text);

    return {
      score: clamp(parsed.score ?? 0),
      feedback: parsed.feedback || "Review your answer structure.",
      star_score: clamp(parsed.star_score ?? 0),
      relevance_score: clamp(parsed.relevance_score ?? 0),
      specificity_score: clamp(parsed.specificity_score ?? 0),
      confidence_coaching:
        parsed.confidence_coaching || "Focus on confident delivery.",
      rewrite_suggestions: Array.isArray(parsed.rewrite_suggestions)
        ? parsed.rewrite_suggestions.slice(0, 3)
        : [],
    };
  } catch {
    return scorePracticeAnswer(question, userAnswer);
  }
}

function clamp(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}
