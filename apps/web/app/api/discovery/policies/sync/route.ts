import { requireAdmin } from "@/lib/auth";
import { syncValidatedDiscoverySearches } from "@/lib/discovery/policies";

/**
 * POST /api/discovery/policies/sync
 *
 * Admin/superadmin: force-sync validated policies into runner-consumable searches.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const sync = await syncValidatedDiscoverySearches();
    return Response.json({ success: true, sync });
  } catch (error) {
    console.error("Discovery policy sync failed:", error);
    return Response.json(
      { success: false, error: "Failed to sync discovery policies." },
      { status: 500 }
    );
  }
}
