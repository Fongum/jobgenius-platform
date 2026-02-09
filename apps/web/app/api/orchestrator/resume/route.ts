export async function POST() {
  return Response.json(
    { success: false, error: "Legacy orchestrator disabled." },
    { status: 410 }
  );
}
