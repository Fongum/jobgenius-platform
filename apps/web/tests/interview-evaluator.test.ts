import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
let configured = true;

vi.mock("@/lib/openai", () => ({
  OPENAI_MODEL: "test-model",
  isOpenAIConfigured: () => configured,
  getOpenAIClient: () => ({ chat: { completions: { create } } }),
}));

// interview-context imports the real Supabase client at module load.
vi.mock("@/lib/auth", () => ({ supabaseAdmin: { from: () => ({}) } }));

import {
  buildHeuristicEvaluation,
  evaluateInterview,
  type QAPair,
} from "@/lib/portal/interview-evaluator";
import { normalizePersona, type InterviewContext } from "@/lib/portal/interview-context";

const context: InterviewContext = {
  job: { title: "Backend Engineer", company: "Acme", description: "Build APIs with Postgres." },
  candidate: { fullName: "Sam", skills: ["Postgres"], workHistory: [], education: [] },
  hasResume: true,
};

const strongAnswer =
  "At my last company the checkout API was timing out under load (situation). I owned the fix (task). " +
  "I added connection pooling and cached the hot queries (action), which cut p95 latency by 62% and " +
  "saved $40k a year (result).";

const pairs: QAPair[] = [
  { question: "Tell me about a hard technical problem.", answer: strongAnswer },
  { question: "How do you prioritize?", answer: "I just do what seems important." },
];

function aiResponse(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

function fullAiPayload(overrides: Record<string, unknown> = {}) {
  return {
    answers: [
      {
        score: 88,
        star_score: 90,
        relevance_score: 85,
        specificity_score: 92,
        feedback: "Great quantified result.",
        confidence_coaching: "Slow down slightly.",
        rewrite_suggestions: ["Lead with the outcome."],
      },
      {
        score: 40,
        star_score: 30,
        relevance_score: 50,
        specificity_score: 20,
        feedback: "Too vague.",
        confidence_coaching: "Give an example.",
        rewrite_suggestions: ["Name a real prioritization decision."],
      },
    ],
    overall_score: 64,
    star_score: 60,
    communication_score: 56,
    relevance_score: 68,
    summary: "Solid start, vague second answer.",
    strengths: ["Quantifies impact"],
    weaknesses: ["Vague prioritization answer"],
    star_breakdown: { situation: "s", task: "t", action: "a", result: "r" },
    improvement_plan: ["Prepare a prioritization story"],
    am_coaching_note: "Ready for screens, not final rounds.",
    ...overrides,
  };
}

beforeEach(() => {
  create.mockReset();
  configured = true;
});

describe("buildHeuristicEvaluation", () => {
  it("scores every answer in range and marks itself heuristic", () => {
    const result = buildHeuristicEvaluation(pairs);
    expect(result.scoredBy).toBe("heuristic");
    expect(result.answers).toHaveLength(2);
    for (const a of result.answers) {
      for (const s of [a.score, a.star_score, a.relevance_score, a.specificity_score]) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
    expect(result.amCoachingNote).toMatch(/AI unavailable/);
  });

  it("ranks a structured, quantified answer above a vague one", () => {
    const [strong, vague] = buildHeuristicEvaluation(pairs).answers;
    expect(strong.score).toBeGreaterThan(vague.score);
  });

  it("handles an empty transcript without NaN", () => {
    const result = buildHeuristicEvaluation([]);
    expect(result.overallScore).toBe(0);
    expect(result.answers).toEqual([]);
  });
});

describe("evaluateInterview", () => {
  it("skips the model entirely for an empty transcript", async () => {
    const result = await evaluateInterview({ context, persona: "professional", qaPairs: [] });
    expect(create).not.toHaveBeenCalled();
    expect(result.scoredBy).toBe("heuristic");
  });

  it("falls back to heuristic when OpenAI is not configured", async () => {
    configured = false;
    const result = await evaluateInterview({ context, persona: "professional", qaPairs: pairs });
    expect(create).not.toHaveBeenCalled();
    expect(result.scoredBy).toBe("heuristic");
  });

  it("uses AI output when the model returns valid JSON", async () => {
    create.mockResolvedValue(aiResponse(fullAiPayload()));
    const result = await evaluateInterview({ context, persona: "technical", qaPairs: pairs });

    expect(result.scoredBy).toBe("ai");
    expect(result.overallScore).toBe(64);
    expect(result.amCoachingNote).toBe("Ready for screens, not final rounds.");
    expect(result.answers[0].feedback).toBe("Great quantified result.");
    expect(result.report.competencies).toEqual({ communication: 56, relevance: 68, star: 60 });

    // The prompt is grounded in the role, résumé and transcript.
    const args = create.mock.calls[0][0];
    expect(args.model).toBe("test-model");
    const userMsg = args.messages.find((m: { role: string }) => m.role === "user").content;
    expect(userMsg).toContain("Backend Engineer at Acme");
    expect(userMsg).toContain("Q1: Tell me about a hard technical problem.");
    expect(userMsg).toContain("Postgres");
  });

  it("clamps out-of-range and non-numeric AI scores", async () => {
    const payload = fullAiPayload({ overall_score: 250, star_score: -20, relevance_score: "high" });
    (payload.answers[0] as Record<string, unknown>).score = 999;
    create.mockResolvedValue(aiResponse(payload));

    const result = await evaluateInterview({ context, persona: "professional", qaPairs: pairs });
    expect(result.overallScore).toBe(100);
    expect(result.starScore).toBe(0);
    // Non-numeric relevance_score → average of per-answer relevance (85, 50).
    expect(result.relevanceScore).toBe(68);
    expect(result.answers[0].score).toBe(100);
  });

  it("fills missing per-answer entries from the heuristic instead of dropping them", async () => {
    const payload = fullAiPayload();
    payload.answers = payload.answers.slice(0, 1); // model returned 1 of 2
    create.mockResolvedValue(aiResponse(payload));

    const result = await evaluateInterview({ context, persona: "professional", qaPairs: pairs });
    expect(result.scoredBy).toBe("ai");
    expect(result.answers).toHaveLength(2);
    expect(result.answers[0].score).toBe(88);
    expect(result.answers[1].feedback.length).toBeGreaterThan(0);
  });

  it("supplies defaults when narrative fields are missing", async () => {
    create.mockResolvedValue(
      aiResponse(fullAiPayload({ summary: "  ", am_coaching_note: undefined, star_breakdown: null }))
    );
    const result = await evaluateInterview({ context, persona: "professional", qaPairs: pairs });
    expect(result.summary).toBe("Mock interview completed.");
    expect(result.amCoachingNote).toMatch(/^Overall 64%/);
    expect(result.report.star_breakdown.result).toBe("Quantify the outcome.");
  });

  it.each([
    ["the request throws", () => create.mockRejectedValue(new Error("boom"))],
    ["the model returns invalid JSON", () =>
      create.mockResolvedValue({ choices: [{ message: { content: "not json" } }] })],
    ["the model returns no content", () =>
      create.mockResolvedValue({ choices: [{ message: { content: null } }] })],
  ])("falls back to heuristic when %s", async (_label, arrange) => {
    arrange();
    const result = await evaluateInterview({ context, persona: "professional", qaPairs: pairs });
    expect(result.scoredBy).toBe("heuristic");
    expect(result.answers).toHaveLength(2);
  });
});

describe("normalizePersona", () => {
  it("passes known personas through and defaults everything else", () => {
    expect(normalizePersona("stress")).toBe("stress");
    expect(normalizePersona("technical")).toBe("technical");
    expect(normalizePersona("hacker")).toBe("professional");
    expect(normalizePersona(undefined)).toBe("professional");
    expect(normalizePersona(42)).toBe("professional");
  });
});
