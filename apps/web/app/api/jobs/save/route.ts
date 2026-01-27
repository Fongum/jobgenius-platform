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

  const { data, error } = await supabaseServer
    .from("saved_jobs")
    .insert({
      title: payload.title,
      url: payload.url,
      source: payload.source ?? "extension",
      raw_html: payload.raw_html ?? null,
      raw_text: payload.raw_text ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({
        success: true,
        id: null,
        duplicate: true,
        needs_attention: false,
      });
    }

    return Response.json(
      { success: false, error: "Failed to save job." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    id: data.id,
    duplicate: false,
    needs_attention: false,
  });
}