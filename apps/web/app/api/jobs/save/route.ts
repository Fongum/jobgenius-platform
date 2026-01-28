import { supabaseServer } from "@/lib/supabase/server";

type SaveJobPayload = {
  title?: string;
  url?: string;
  source?: string;
  raw_html?: string | null;
  raw_text?: string | null;
};

export async function POST(request: Request) {
  let payload: SaveJobPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!payload?.title || !payload?.url) {
    return Response.json(
      { success: false, error: "Missing required fields: title, url." },
      { status: 400 }
    );
  }

  const { data: existingPost, error: existingError } = await supabaseServer
    .from("job_posts")
    .select("id")
    .eq("url", payload.url)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { success: false, error: "Failed to check existing job post." },
      { status: 500 }
    );
  }

  let insertedId: string | null = null;

  if (!existingPost) {
    const { data: insertedPost, error: insertError } = await supabaseServer
      .from("job_posts")
      .insert({
        title: payload.title,
        url: payload.url,
        source: payload.source ?? "extension",
        description_text: payload.raw_text ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      return Response.json(
        { success: false, error: "Failed to save job." },
        { status: 500 }
      );
    }

    insertedId = insertedPost.id;
  }

  const { error: savedJobsError } = await supabaseServer.from("saved_jobs").upsert(
    {
      title: payload.title,
      url: payload.url,
      source: payload.source ?? "extension",
      raw_html: payload.raw_html ?? null,
      raw_text: payload.raw_text ?? null,
    },
    { onConflict: "url" }
  );

  if (savedJobsError) {
    return Response.json(
      { success: false, error: "Failed to save job." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    id: insertedId,
    duplicate: Boolean(existingPost),
    needs_attention: false,
  });
}
