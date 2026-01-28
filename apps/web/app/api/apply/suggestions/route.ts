import { getAccountManagerFromRequest } from "@/lib/am-access";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const amResult = await getAccountManagerFromRequest(request.headers);
  if ("error" in amResult) {
    return Response.json({ success: false, error: amResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ats = searchParams.get("ats");
  const errorCode = searchParams.get("error_code");

  if (!ats || !errorCode) {
    return Response.json(
      { success: false, error: "Missing ats or error_code." },
      { status: 400 }
    );
  }

  const { data: suggestions, error } = await supabaseServer
    .from("apply_error_suggestions")
    .select("suggestion")
    .eq("ats_type", ats)
    .eq("error_code", errorCode)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to load suggestions." },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    suggestions: (suggestions ?? []).map((row) => row.suggestion),
  });
}
