import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";

type QuizQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  user_answer: number | null;
  is_correct: boolean | null;
};

type GenerateQuizParams = {
  jobTitle: string;
  companyName?: string | null;
  descriptionText?: string | null;
  quizType: string;
  prepContentSummary?: string | null;
  count?: number;
};

export async function generateQuizQuestions(
  params: GenerateQuizParams
): Promise<QuizQuestion[]> {
  const count = params.count ?? 10;

  if (!isOpenAIConfigured()) {
    return buildFallbackQuiz(params.jobTitle, params.quizType, count);
  }

  try {
    const client = getOpenAIClient();

    const contextParts = [
      `Job: ${params.jobTitle}`,
      params.companyName ? `Company: ${params.companyName}` : null,
      params.descriptionText
        ? `Description: ${params.descriptionText.slice(0, 2000)}`
        : null,
      `Quiz type: ${params.quizType}`,
      params.prepContentSummary
        ? `Prep content: ${params.prepContentSummary.slice(0, 1000)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.6,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert interview preparation coach. Generate multiple-choice quiz questions to help a candidate prepare for an interview.

Generate ${count} questions with 4 options each. Include:
- Mix of difficulty levels (30% easy, 50% medium, 20% hard)
- For technical: test knowledge from the job description
- For behavioral: test STAR thinking and situational judgment
- For company: test knowledge about the company and role
- Each question must have exactly one correct answer and an explanation

Return JSON: { "questions": [{ "question": string, "options": string[4], "correct_index": 0-3, "explanation": string }] }`,
        },
        {
          role: "user",
          content: contextParts,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildFallbackQuiz(params.jobTitle, params.quizType, count);
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.questions)) {
      return buildFallbackQuiz(params.jobTitle, params.quizType, count);
    }

    return parsed.questions.slice(0, count).map(
      (q: {
        question?: string;
        options?: string[];
        correct_index?: number;
        explanation?: string;
      }) => ({
        question: typeof q.question === "string" ? q.question : "Question",
        options: Array.isArray(q.options) ? q.options.slice(0, 4) : ["A", "B", "C", "D"],
        correct_index:
          typeof q.correct_index === "number" && q.correct_index >= 0 && q.correct_index <= 3
            ? q.correct_index
            : 0,
        explanation: typeof q.explanation === "string" ? q.explanation : "",
        user_answer: null,
        is_correct: null,
      })
    );
  } catch {
    return buildFallbackQuiz(params.jobTitle, params.quizType, count);
  }
}

function buildFallbackQuiz(
  jobTitle: string,
  quizType: string,
  count: number
): QuizQuestion[] {
  const templates = [
    {
      question: `What is the most important quality for a ${jobTitle} role?`,
      options: [
        "Strong communication skills",
        "Technical expertise only",
        "Working independently always",
        "Avoiding feedback",
      ],
      correct_index: 0,
      explanation: "Communication skills are essential in most professional roles.",
    },
    {
      question: "In the STAR method, what does the 'A' stand for?",
      options: ["Achievement", "Action", "Assessment", "Analysis"],
      correct_index: 1,
      explanation: "STAR stands for Situation, Task, Action, Result.",
    },
    {
      question: "What is the best approach when you don't know the answer to a technical question?",
      options: [
        "Make up an answer",
        "Stay silent",
        "Acknowledge it honestly and explain your approach to finding the answer",
        "Change the subject",
      ],
      correct_index: 2,
      explanation:
        "Honesty and showing your problem-solving approach demonstrates integrity and learning ability.",
    },
    {
      question: "When preparing for an interview, you should research:",
      options: [
        "Only the job title",
        "The company, role, industry, and recent news",
        "Only the salary range",
        "Nothing — be spontaneous",
      ],
      correct_index: 1,
      explanation: "Thorough research shows genuine interest and preparation.",
    },
    {
      question: "What is the purpose of asking questions at the end of an interview?",
      options: [
        "To extend the meeting",
        "To show interest and evaluate if the role is right for you",
        "To negotiate salary immediately",
        "It's not important",
      ],
      correct_index: 1,
      explanation:
        "Asking thoughtful questions shows engagement and helps you make informed decisions.",
    },
  ];

  const questions: QuizQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    questions.push({
      ...template,
      user_answer: null,
      is_correct: null,
    });
  }
  return questions;
}
