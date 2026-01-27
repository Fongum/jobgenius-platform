export async function POST(request: Request) {
  const payload = await request.json();
  console.log("Saved job payload:", payload);

  return Response.json({ success: true });
}