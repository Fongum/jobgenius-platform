import { supabaseServer } from "@/lib/supabase/server";
import { requireOpsAuth } from "@/lib/ops-auth";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireOpsAuth(request.headers, request.url);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: 401 });
  }

  const alertId = params.id;
  if (!alertId) {
    return Response.json(
      { success: false, error: "Missing alert id." },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer
    .from("ops_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", alertId);

  if (error) {
    return Response.json(
      { success: false, error: "Failed to resolve alert." },
      { status: 500 }
    );
  }

  return Response.json({ success: true });
}
