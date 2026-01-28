import { supabaseServer } from "@/lib/supabase/server";

type MatchPayload = {
  job_seeker_id?: string;
  job_post_id?: string;
};

function extractSalaryNumbers(text: string) {
  const numbers: number[] = [];
  const lower = text.toLowerCase();

  const kRegex = /\$?\s?(\d{2,3})\s?k\b/g;
  let match = kRegex.exec(lower);
  while (match) {
    numbers.push(Number.parseInt(match[1], 10) * 1000);
    match = kRegex.exec(lower);
  }

  const fullRegex = /\$?\s?(\d{2,3})[,\s]?(\d{3})\b/g;
  match = fullRegex.exec(lower);
  while (match) {
    numbers.push(Number.parseInt(`${match[1]}${match[2]}`, 10));
    match = fullRegex.exec(lower);
  }

  return numbers;
}

function computeScore({
  jobTitle,
  descriptionText,
  jobLocation,
  seeker,
}: {
  jobTitle: string;
  descriptionText: string;
  jobLocation: string | null;
  seeker: {
    location: string | null;
    seniority: string | null;
    salary_min: number | null;
    salary_max: number | null;
    work_type: string | null;
    target_titles: string[];
    skills: string[];
  };
}) {
  const combinedText = `${jobTitle} ${descriptionText}`.toLowerCase();
  const titleLower = jobTitle.toLowerCase();

  const titleHits = seeker.target_titles.filter((title) => {
    const normalized = title.trim().toLowerCase();
    return normalized && titleLower.includes(normalized);
  });

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of seeker.skills) {
    const normalized = skill.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    if (combinedText.includes(normalized)) {
      matchedSkills.push(skill);
    } else {
      missingSkills.push(skill);
    }
  }

  const titleScore = Math.min(30, titleHits.length * 15);
  const skillsScore = Math.min(40, matchedSkills.length * 8);

  let locationScore = 0;
  if (seeker.location && jobLocation) {
    const seekerLocation = seeker.location.toLowerCase();
    if (jobLocation.toLowerCase().includes(seekerLocation)) {
      locationScore += 6;
    }
  }

  if (seeker.work_type) {
    const workType = seeker.work_type.toLowerCase();
    if (combinedText.includes(workType)) {
      locationScore += 6;
    }
  }
  locationScore = Math.min(10, locationScore);

  let seniorityScore = 0;
  if (seeker.seniority) {
    const seniority = seeker.seniority.toLowerCase();
    if (combinedText.includes(seniority)) {
      seniorityScore = 10;
    }
  }

  let salaryScore = 0;
  const salaryNumbers = extractSalaryNumbers(combinedText);
  if (salaryNumbers.length > 0 && (seeker.salary_min || seeker.salary_max)) {
    const seekerMin = seeker.salary_min ?? 0;
    const seekerMax = seeker.salary_max ?? Number.POSITIVE_INFINITY;
    const hasOverlap = salaryNumbers.some(
      (value) => value >= seekerMin && value <= seekerMax
    );
    if (hasOverlap) {
      salaryScore = 10;
    }
  }

  const score = Math.min(
    100,
    titleScore + skillsScore + locationScore + seniorityScore + salaryScore
  );

  return {
    score,
    reasons: {
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
      title_hits: titleHits,
    },
  };
}

export async function POST(request: Request) {
  let payload: MatchPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.job_seeker_id) {
    return Response.json(
      { success: false, error: "Missing job_seeker_id." },
      { status: 400 }
    );
  }

  const { data: seeker, error: seekerError } = await supabaseServer
    .from("job_seekers")
    .select(
      "id, location, seniority, salary_min, salary_max, work_type, target_titles, skills"
    )
    .eq("id", payload.job_seeker_id)
    .single();

  if (seekerError || !seeker) {
    return Response.json(
      { success: false, error: "Job seeker not found." },
      { status: 404 }
    );
  }

  let jobPostsQuery = supabaseServer
    .from("job_posts")
    .select("id, title, description_text, location");

  if (payload.job_post_id) {
    jobPostsQuery = jobPostsQuery.eq("id", payload.job_post_id);
  }

  const { data: jobPosts, error: jobPostsError } = await jobPostsQuery;

  if (jobPostsError) {
    return Response.json(
      { success: false, error: "Failed to load job posts." },
      { status: 500 }
    );
  }

  const posts = jobPosts ?? [];

  let matchedCount = 0;

  for (const post of posts) {
    const { score, reasons } = computeScore({
      jobTitle: post.title,
      descriptionText: post.description_text ?? "",
      jobLocation: post.location ?? null,
      seeker,
    });

    const { error: upsertError } = await supabaseServer
      .from("job_match_scores")
      .upsert(
        {
          job_post_id: post.id,
          job_seeker_id: seeker.id,
          score,
          reasons,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_post_id,job_seeker_id" }
      );

    if (upsertError) {
      return Response.json(
        { success: false, error: "Failed to save match score." },
        { status: 500 }
      );
    }

    matchedCount += 1;
  }

  return Response.json({ success: true, matched: matchedCount });
}
