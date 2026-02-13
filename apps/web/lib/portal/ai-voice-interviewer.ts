import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";

type VoiceInterviewerResponse = {
  response: string;
  score: number | null;
  feedback: string | null;
  is_final: boolean;
};

type TurnHistory = {
  speaker: string;
  content: string;
};

type VoiceInterviewParams = {
  persona: string;
  jobTitle: string;
  companyName?: string | null;
  descriptionText?: string | null;
  turnHistory: TurnHistory[];
  turnNumber: number;
  candidateResponse?: string | null;
};

const PERSONA_DESCRIPTIONS: Record<string, string> = {
  professional: "a friendly but thorough HR interviewer",
  technical: "a senior engineer conducting a technical screen",
  behavioral: "a hiring manager focused on culture fit and leadership",
  stress: "a direct, challenging interviewer who pushes back on vague answers",
};

const MAX_TURNS = 10;

export async function getInterviewerResponse(
  params: VoiceInterviewParams
): Promise<VoiceInterviewerResponse> {
  if (!isOpenAIConfigured()) {
    return buildFallbackResponse(params);
  }

  try {
    const client = getOpenAIClient();
    const personaDesc =
      PERSONA_DESCRIPTIONS[params.persona] || PERSONA_DESCRIPTIONS.professional;

    const historyText = params.turnHistory
      .map((t) => `${t.speaker === "interviewer" ? "Interviewer" : "Candidate"}: ${t.content}`)
      .join("\n\n");

    const contextParts = [
      params.companyName ? `Company: ${params.companyName}` : null,
      params.descriptionText
        ? `Job description: ${params.descriptionText.slice(0, 1500)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.6,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are ${personaDesc}. You are conducting an interview for the position of ${params.jobTitle}${params.companyName ? ` at ${params.companyName}` : ""}.

Rules:
- Ask one question at a time
- Listen to the candidate's answer and ask relevant follow-ups
- After 5-8 exchanges, wrap up the interview professionally
- Stay in character throughout
- Do not reveal you are AI

${contextParts ? `Context:\n${contextParts}` : ""}

This is turn ${params.turnNumber} of the interview.

Based on the candidate's last response, either:
1. Ask a follow-up question to dig deeper
2. Move to a new topic with a new question
3. If turn >= 6, begin wrapping up

Also score the candidate's last response (0-100) with brief feedback.

Return JSON: { "response": string, "score": number|null, "feedback": string|null, "is_final": boolean }`,
        },
        {
          role: "user",
          content: historyText
            ? `Conversation so far:\n${historyText}`
            : "Please start the interview with an opening question.",
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildFallbackResponse(params);
    }

    const parsed = JSON.parse(text);
    return {
      response: typeof parsed.response === "string" ? parsed.response : "Could you tell me more?",
      score: typeof parsed.score === "number" ? parsed.score : null,
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : null,
      is_final:
        typeof parsed.is_final === "boolean"
          ? parsed.is_final
          : params.turnNumber >= MAX_TURNS,
    };
  } catch {
    return buildFallbackResponse(params);
  }
}

function buildFallbackResponse(params: VoiceInterviewParams): VoiceInterviewerResponse {
  const { turnNumber, persona } = params;

  if (turnNumber >= MAX_TURNS || turnNumber >= 8) {
    return {
      response:
        "Thank you for your time today. We've covered a lot of ground. Do you have any questions for me?",
      score: null,
      feedback: null,
      is_final: true,
    };
  }

  const openerQuestions: Record<string, string[]> = {
    professional: [
      "Welcome! Let's start with you telling me a bit about yourself and what drew you to this role.",
      "Great. Can you walk me through a recent accomplishment you're proud of?",
      "How do you typically handle tight deadlines and competing priorities?",
      "Where do you see yourself in three to five years?",
      "Tell me about a time you received constructive feedback. How did you handle it?",
      "What questions do you have for me about the role or the team?",
    ],
    technical: [
      "Let's get started. Can you describe your technical background and the technologies you work with?",
      "Walk me through a technical challenge you solved recently.",
      "How do you approach debugging a complex production issue?",
      "Tell me about a time you had to learn a new technology quickly.",
      "How do you ensure code quality in your projects?",
      "Do you have any questions about our tech stack?",
    ],
    behavioral: [
      "Thanks for joining. Let's start — tell me about a time you led a team through a difficult situation.",
      "How do you build trust with new team members?",
      "Describe a situation where you had to influence someone without direct authority.",
      "Tell me about a time you failed and what you learned.",
      "How do you handle conflict within a team?",
      "What's your leadership philosophy?",
    ],
    stress: [
      "Let's jump right in. Why should we hire you over the other candidates?",
      "Your resume shows a gap. What were you doing during that time?",
      "That answer was vague. Can you be more specific with numbers?",
      "What's your biggest weakness, and don't give me a strength disguised as a weakness.",
      "If your team disagreed with your approach, would you still proceed?",
      "Convince me this role is the right fit for you.",
    ],
  };

  const questions = openerQuestions[persona] || openerQuestions.professional;
  const questionIndex = Math.min(Math.floor(turnNumber / 2), questions.length - 1);

  return {
    response: questions[questionIndex],
    score: turnNumber > 0 && params.candidateResponse ? 65 : null,
    feedback:
      turnNumber > 0 && params.candidateResponse
        ? "Try to include more specific examples and quantify your impact."
        : null,
    is_final: false,
  };
}
