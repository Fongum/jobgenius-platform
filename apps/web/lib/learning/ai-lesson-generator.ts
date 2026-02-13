import { getOpenAIClient, OPENAI_MODEL, isOpenAIConfigured } from "@/lib/openai";

type LessonContent = {
  body: string;
  summary: string;
};

type GenerateLessonParams = {
  trackTitle: string;
  category: string;
  lessonTitle: string;
  jobTitle?: string | null;
  company?: string | null;
  skills?: string[] | null;
  seniority?: string | null;
};

type GenerateTrackLessonsParams = {
  trackTitle: string;
  category: string;
  lessonCount: number;
  jobTitle?: string | null;
  company?: string | null;
  skills?: string[] | null;
  seniority?: string | null;
};

type GeneratedLesson = {
  title: string;
  content: LessonContent;
  content_type: "article";
  estimated_minutes: number;
};

export async function generateLessonContent(
  params: GenerateLessonParams
): Promise<LessonContent> {
  if (!isOpenAIConfigured()) {
    return buildFallbackLesson(params.lessonTitle, params.category);
  }

  try {
    const client = getOpenAIClient();

    const contextParts = [
      `Track title: ${params.trackTitle}`,
      `Category: ${params.category}`,
      params.jobTitle ? `Job target: ${params.jobTitle}` : null,
      params.company ? `Company: ${params.company}` : null,
      params.skills?.length ? `Seeker skills: ${params.skills.join(", ")}` : null,
      params.seniority ? `Seniority: ${params.seniority}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.5,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert career skills instructor. Generate a learning lesson for a job seeker preparing for a career transition or skill development.

Return a JSON object with:
- "body": string (markdown, 500-1000 words) — A clear, practical explanation with real-world examples, key takeaways as bullet points, and one exercise or reflection question.
- "summary": string — A 1-2 sentence summary of the lesson.`,
        },
        {
          role: "user",
          content: `Context:\n${contextParts}\n\nGenerate a lesson titled "${params.lessonTitle}".`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildFallbackLesson(params.lessonTitle, params.category);
    }

    const parsed = JSON.parse(text);
    return {
      body: typeof parsed.body === "string" ? parsed.body : `# ${params.lessonTitle}\n\nContent coming soon.`,
      summary: typeof parsed.summary === "string" ? parsed.summary : params.lessonTitle,
    };
  } catch {
    return buildFallbackLesson(params.lessonTitle, params.category);
  }
}

export async function generateTrackLessons(
  params: GenerateTrackLessonsParams
): Promise<GeneratedLesson[]> {
  if (!isOpenAIConfigured()) {
    return buildFallbackTrackLessons(params.trackTitle, params.category, params.lessonCount);
  }

  try {
    const client = getOpenAIClient();

    const contextParts = [
      `Track title: ${params.trackTitle}`,
      `Category: ${params.category}`,
      `Number of lessons: ${params.lessonCount}`,
      params.jobTitle ? `Job target: ${params.jobTitle}` : null,
      params.company ? `Company: ${params.company}` : null,
      params.skills?.length ? `Seeker skills: ${params.skills.join(", ")}` : null,
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
          content: `You are an expert career skills instructor. Generate a series of learning lessons for a structured learning track.

Return a JSON object with:
- "lessons": array of objects, each with:
  - "title": string — Lesson title
  - "body": string (markdown, 500-1000 words) — Practical content with examples, key takeaways, and an exercise
  - "summary": string — 1-2 sentence summary
  - "estimated_minutes": number — Estimated reading time (5-20 minutes)

Lessons should build on each other progressively.`,
        },
        {
          role: "user",
          content: contextParts,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      return buildFallbackTrackLessons(params.trackTitle, params.category, params.lessonCount);
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.lessons)) {
      return buildFallbackTrackLessons(params.trackTitle, params.category, params.lessonCount);
    }

    return parsed.lessons.slice(0, params.lessonCount).map(
      (lesson: { title?: string; body?: string; summary?: string; estimated_minutes?: number }) => ({
        title: typeof lesson.title === "string" ? lesson.title : "Untitled Lesson",
        content: {
          body: typeof lesson.body === "string" ? lesson.body : "Content coming soon.",
          summary: typeof lesson.summary === "string" ? lesson.summary : "",
        },
        content_type: "article" as const,
        estimated_minutes: typeof lesson.estimated_minutes === "number" ? lesson.estimated_minutes : 10,
      })
    );
  } catch {
    return buildFallbackTrackLessons(params.trackTitle, params.category, params.lessonCount);
  }
}

function buildFallbackLesson(title: string, category: string): LessonContent {
  return {
    body: `# ${title}\n\nThis lesson covers key concepts in ${category}.\n\n## Key Takeaways\n\n- Review the fundamentals\n- Practice with real-world examples\n- Apply what you learn\n\n## Exercise\n\nReflect on how this topic applies to your target role.`,
    summary: `An introduction to ${title} in the context of ${category}.`,
  };
}

function buildFallbackTrackLessons(
  trackTitle: string,
  category: string,
  count: number
): GeneratedLesson[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Lesson ${i + 1}: ${trackTitle} — Part ${i + 1}`,
    content: buildFallbackLesson(`${trackTitle} — Part ${i + 1}`, category),
    content_type: "article" as const,
    estimated_minutes: 10,
  }));
}
