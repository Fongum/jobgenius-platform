import { requireJobSeeker } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/auth";

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "alloy";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireJobSeeker(request);
  if (!auth.authenticated) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OpenAI is not configured." }, { status: 500 });
  }

  const { data: prep } = await supabaseAdmin
    .from("interview_prep")
    .select("id")
    .eq("id", params.id)
    .eq("job_seeker_id", auth.user.id)
    .single();

  if (!prep) {
    return Response.json({ error: "Interview prep not found." }, { status: 404 });
  }

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      modalities: ["audio", "text"],
      input_audio_transcription: { model: "whisper-1" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return Response.json(
      { error: errorText || "Failed to create realtime session." },
      { status: 500 }
    );
  }

  const data = await response.json();
  const token = data?.client_secret?.value;
  if (!token) {
    return Response.json({ error: "Missing realtime token." }, { status: 500 });
  }

  return Response.json({ token, expires_at: data?.client_secret?.expires_at });
}