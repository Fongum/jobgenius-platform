import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";

type QACard = {
  question: string;
  model_answer: string;
  key_points: string[];
  tips: string;
  difficulty: string;
  category: string;
};

type GenerateQAParams = {
  jobTitle: string;
  companyName?: string | null;
  descriptionText?: string | null;
  category: string;
  seekerSkills?: string[] | null;
  seniority?: string | null;
  count?: number;
};

export async function generateQACards(params: GenerateQAParams): Promise<QACard[]> {
  const count = params.count ?? 8;

  if (!isOpenAIConfigured()) {
    return buildFallbackCards(params.jobTitle, params.category, count);
  }

  try {
    const client = getOpenAIClient();

    const contextParts = [
      `Job: ${params.jobTitle}`,
      params.companyName ? `Company: ${params.companyName}` : null,
      params.descriptionText
        ? `Description: ${params.descriptionText.slice(0, 2000)}`
        : null,
      `Category: ${params.category}`,
      params.seekerSkills?.length
        ? `Seeker skills: ${params.seekerSkills.join(", ")}`
        : null,
      params.seniority ? `Seniority: ${params.seniority}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a senior interview coach. Generate structured interview Q&A cards that a candidate can use to prepare model answers.

Generate ${count} interview Q&A cards. Each card should have:
- A realistic interview question for this role
- A model answer (150-300 words) using STAR format where applicable
- 3-5 key points the answer should cover
- A practical tip for delivering the answer
- Difficulty rating (easy, medium, or hard)

Return JSON: { "cards": [{ "question": string, "model_answer": string, "key_points": string[], "tips": string, "difficulty": "easy"|"medium"|"hard" }] }`,
        },
        {
          role: "user",
          content: contextParts,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildFallbackCards(params.jobTitle, params.category, count);
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.cards)) {
      return buildFallbackCards(params.jobTitle, params.category, count);
    }

    return parsed.cards.slice(0, count).map(
      (card: {
        question?: string;
        model_answer?: string;
        key_points?: string[];
        tips?: string;
        difficulty?: string;
      }) => ({
        question: typeof card.question === "string" ? card.question : "Question",
        model_answer: typeof card.model_answer === "string" ? card.model_answer : "",
        key_points: Array.isArray(card.key_points)
          ? card.key_points.filter((p): p is string => typeof p === "string")
          : [],
        tips: typeof card.tips === "string" ? card.tips : "",
        difficulty:
          typeof card.difficulty === "string" &&
          ["easy", "medium", "hard"].includes(card.difficulty)
            ? card.difficulty
            : "medium",
        category: params.category,
      })
    );
  } catch {
    return buildFallbackCards(params.jobTitle, params.category, count);
  }
}

function buildFallbackCards(jobTitle: string, category: string, count: number): QACard[] {
  const templates: QACard[] = [
    {
      question: `Tell me about yourself and why you're interested in this ${jobTitle} role.`,
      model_answer:
        "I have X years of experience in [relevant field]. In my current role at [Company], I've been responsible for [key responsibilities]. I'm particularly drawn to this opportunity because [specific reason related to the role/company]. My experience with [relevant skill] would allow me to contribute immediately to your team's goals.",
      key_points: [
        "Keep it concise (60-90 seconds)",
        "Focus on relevant experience",
        "Connect your background to the role",
        "Show enthusiasm for the opportunity",
      ],
      tips: "Practice a 60-second version and a 90-second version. Start with recent experience and work backwards.",
      difficulty: "easy",
      category,
    },
    {
      question: "Describe a challenging project you led and what you learned from it.",
      model_answer:
        "At [Company], I led a project to [describe project]. The challenge was [specific challenge]. I took action by [specific actions], which resulted in [measurable outcome]. The key lesson I learned was [insight] which I've since applied to [example].",
      key_points: [
        "Use STAR format",
        "Include measurable results",
        "Show leadership qualities",
        "Demonstrate learning and growth",
      ],
      tips: "Choose a project relevant to the role. Quantify impact wherever possible.",
      difficulty: "medium",
      category,
    },
    {
      question: "How do you handle disagreements with team members?",
      model_answer:
        "I believe healthy disagreements lead to better outcomes. When I face a disagreement, I first try to understand the other person's perspective by asking clarifying questions. Then I present my reasoning with data when possible. If we can't reach consensus, I suggest we test both approaches with a small experiment or seek input from a third party.",
      key_points: [
        "Show emotional intelligence",
        "Demonstrate active listening",
        "Focus on collaboration, not winning",
        "Provide a specific example",
      ],
      tips: "Have a real example ready. Avoid painting yourself as always right.",
      difficulty: "medium",
      category,
    },
  ];

  const cards: QACard[] = [];
  for (let i = 0; i < count; i++) {
    cards.push({ ...templates[i % templates.length] });
  }
  return cards;
}
