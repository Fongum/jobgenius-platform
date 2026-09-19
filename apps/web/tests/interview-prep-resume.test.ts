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
  buildCandidateContextBlock as reExportedBlock,
  buildRealtimeInstructions,
} from "@/lib/portal/interview-context";
import {
  asStringArray,
  buildCandidateContextBlock,
  candidateFromSeekerRow,
  candidateHasResume,
} from "@/lib/portal/candidate-context";
import { buildInterviewPrepContentWithAI } from "@/lib/interview-prep-ai";

const packJson = {
  role_summary: "Backend role.",
  company_notes: ["a", "b"],
  likely_questions: Array.from({ length: 16 }, (_, i) => `Q${i}`),
  answer_structure: ["s", "t", "a", "r"],
  technical_topics: ["x", "y"],
  behavioral_topics: ["p", "q"],
  checklist: ["c1", "c2", "c3", "c4"],
  thirty_sixty_ninety: ["30", "60", "90"],
};

function aiOk() {
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(packJson) } }] });
}

const seekerRow = {
  full_name: "Sam Doe",
  skills: ["Postgres", "TypeScript"],
  work_history: [
    { title: "Backend Engineer", company: "Initech", duration: "2021-2024" },
    { role: "Intern", employer: "Globex" },
    "Freelance developer",
  ],
  education: [{ degree: "BSc Computer Science", school: "State University", year: "2020" }],
};

const base = { jobTitle: "Backend Engineer", companyName: "Acme", descriptionText: "APIs." };

const systemPrompt = () => create.mock.calls[0][0].messages[0].content as string;
const userPrompt = () => create.mock.calls[0][0].messages[1].content as string;

beforeEach(() => {
  create.mockReset();
  configured = true;
});

describe("candidate-context", () => {
  it("flattens jsonb work_history/education objects into readable lines", () => {
    const c = candidateFromSeekerRow(seekerRow);
    expect(c.fullName).toBe("Sam Doe");
    expect(c.workHistory).toEqual([
      "Backend Engineer — Initech — 2021-2024",
      "Intern — Globex",
      "Freelance developer",
    ]);
    expect(c.education).toEqual(["BSc Computer Science — State University — 2020"]);
  });

  it("tolerates a missing row and junk column shapes", () => {
    const empty = candidateFromSeekerRow(null);
    expect(empty).toEqual({ fullName: null, skills: [], workHistory: [], education: [] });
    expect(candidateHasResume(empty)).toBe(false);

    const junk = candidateFromSeekerRow({ skills: "postgres", work_history: { a: 1 }, education: 5 });
    expect(junk.skills).toEqual([]);
    expect(junk.workHistory).toEqual([]);
  });

  it("caps list sizes and drops blank/opaque entries", () => {
    expect(asStringArray(["a", "  ", "b", {}, "c"], 2)).toEqual(["a", "b"]);
    expect(asStringArray(Array.from({ length: 50 }, (_, i) => `s${i}`), 25)).toHaveLength(25);
  });

  it("renders a prompt block, empty when there is no résumé", () => {
    const block = buildCandidateContextBlock(candidateFromSeekerRow(seekerRow));
    expect(block).toContain("Candidate skills: Postgres, TypeScript");
    expect(block).toContain("- Backend Engineer — Initech — 2021-2024");
    expect(block).toContain("Candidate education:");
    expect(buildCandidateContextBlock(candidateFromSeekerRow(null))).toBe("");
  });
});

describe("interview-context (uses the extracted helpers)", () => {
  const context = {
    job: { title: "Backend Engineer", company: "Acme", description: "Build APIs." },
    candidate: candidateFromSeekerRow(seekerRow),
    hasResume: true,
  };

  it("still re-exports buildCandidateContextBlock for existing importers", () => {
    expect(reExportedBlock).toBe(buildCandidateContextBlock);
  });

  it("builds realtime instructions grounded in the résumé", () => {
    const text = buildRealtimeInstructions("technical", context);
    expect(text).toContain("Backend Engineer");
    expect(text).toContain("Backend Engineer — Initech — 2021-2024");
  });
});

describe("buildInterviewPrepContentWithAI — résumé grounding", () => {
  it("includes the full résumé and the use-it instructions when a candidate is given", async () => {
    aiOk();
    await buildInterviewPrepContentWithAI({ ...base, candidate: candidateFromSeekerRow(seekerRow) });

    expect(userPrompt()).toContain("Backend Engineer — Initech — 2021-2024");
    expect(userPrompt()).toContain("BSc Computer Science");
    expect(systemPrompt()).toMatch(/At least 4 of the likely_questions must probe the candidate's ACTUAL/);
    expect(systemPrompt()).toMatch(/Never invent employers/);
  });

  it("keeps the old skills-only behaviour (and no résumé instructions) without a candidate", async () => {
    aiOk();
    await buildInterviewPrepContentWithAI({ ...base, seekerSkills: ["Go", "Rust"] });

    expect(userPrompt()).toContain("Candidate skills: Go, Rust");
    expect(systemPrompt()).not.toMatch(/ACTUAL roles/);
  });

  it("prefers the full candidate over seekerSkills when both are passed", async () => {
    aiOk();
    await buildInterviewPrepContentWithAI({
      ...base,
      seekerSkills: ["Go"],
      candidate: candidateFromSeekerRow(seekerRow),
    });
    expect(userPrompt()).toContain("Postgres, TypeScript");
    expect(userPrompt()).not.toContain("Candidate skills: Go");
  });

  it("treats an empty candidate as no résumé and falls back to seekerSkills", async () => {
    aiOk();
    await buildInterviewPrepContentWithAI({
      ...base,
      seekerSkills: ["Go"],
      candidate: candidateFromSeekerRow(null),
    });
    expect(userPrompt()).toContain("Candidate skills: Go");
    expect(systemPrompt()).not.toMatch(/ACTUAL roles/);
  });

  it("still returns the template pack when the model call fails", async () => {
    create.mockRejectedValue(new Error("boom"));
    const pack = await buildInterviewPrepContentWithAI({
      ...base,
      candidate: candidateFromSeekerRow(seekerRow),
    });
    expect(pack.likely_questions.length).toBeGreaterThanOrEqual(15);
    expect(pack.role_summary).toContain("Backend Engineer");
  });

  it("uses the template and skips the model when OpenAI is not configured", async () => {
    configured = false;
    const pack = await buildInterviewPrepContentWithAI({
      ...base,
      candidate: candidateFromSeekerRow(seekerRow),
    });
    expect(create).not.toHaveBeenCalled();
    expect(pack.checklist.length).toBeGreaterThan(0);
  });
});
