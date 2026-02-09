import { supabaseServer } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AlertsList from "./AlertsList";

type HeartbeatRow = {
  runner_id: string;
  ts: string;
  meta: Record<string, unknown>;
};

type AlertRow = {
  id: string;
  severity: string;
  type: string;
  message: string;
  created_at: string;
};

export default async function OpsDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const isAdmin =
    user.userType === "am" && ["admin", "superadmin"].includes(user.role ?? "");
  if (!isAdmin) {
    return (
      <main>
        <h1>Ops Dashboard</h1>
        <p>Not authorized.</p>
      </main>
    );
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: kpis } = await supabaseServer
    .from("v_ops_kpis_hourly")
    .select("*")
    .gte("hour", since)
    .order("hour", { ascending: false });

  const { data: runs } = await supabaseServer
    .from("application_runs")
    .select("id, status")
    .in("status", ["RUNNING", "RETRYING"]);

  const { data: heartbeatRows } = await supabaseServer
    .from("runner_heartbeats")
    .select("runner_id, ts, meta")
    .order("ts", { ascending: false })
    .limit(200);

  const latestHeartbeats = new Map<string, HeartbeatRow>();
  for (const hb of heartbeatRows ?? []) {
    if (!latestHeartbeats.has(hb.runner_id)) {
      latestHeartbeats.set(hb.runner_id, hb);
    }
  }

  const { data: alerts } = await supabaseServer
    .from("ops_alerts")
    .select("id, severity, type, message, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  const totals = (kpis ?? []).reduce(
    (acc, row) => {
      acc.claimed += row.claimed ?? 0;
      acc.completed += row.completed ?? 0;
      acc.paused += row.paused ?? 0;
      return acc;
    },
    { claimed: 0, completed: 0, paused: 0 }
  );

  const successRate =
    totals.claimed > 0 ? (totals.completed / totals.claimed) * 100 : 0;

  const pauseReasonMap = new Map<string, number>();
  const { data: pauseEvents } = await supabaseServer
    .from("apply_run_events")
    .select("payload, ts, event_type")
    .eq("event_type", "NEEDS_ATTENTION")
    .gte("ts", since)
    .limit(500);

  for (const event of pauseEvents ?? []) {
    const reason = event.payload?.reason ?? "UNKNOWN";
    pauseReasonMap.set(reason, (pauseReasonMap.get(reason) ?? 0) + 1);
  }

  const topPauseReasons = Array.from(pauseReasonMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <main style={{ display: "grid", gap: "20px" }}>
      <header>
        <h1>Ops Dashboard</h1>
        <p>Last 24 hours overview.</p>
      </header>

      <section style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
          <strong>Success Rate</strong>
          <div>{successRate.toFixed(1)}%</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
          <strong>Claimed Runs</strong>
          <div>{totals.claimed}</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
          <strong>Paused Runs</strong>
          <div>{totals.paused}</div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
          <strong>Active Runs</strong>
          <div>{runs?.length ?? 0}</div>
        </div>
      </section>

      <section>
        <h2>Top Pause Reasons</h2>
        {topPauseReasons.length === 0 ? (
          <p>No pause data.</p>
        ) : (
          <ul>
            {topPauseReasons.map(([reason, count]) => (
              <li key={reason}>
                {reason}: {count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Runner Health</h2>
        {latestHeartbeats.size === 0 ? (
          <p>No heartbeats yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Runner</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Last Heartbeat</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Meta</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(latestHeartbeats.values()).map((hb) => (
                <tr key={hb.runner_id}>
                  <td style={{ padding: "6px 4px" }}>{hb.runner_id}</td>
                  <td style={{ padding: "6px 4px" }}>{hb.ts}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(hb.meta ?? {}, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Alerts</h2>
        <AlertsList alerts={(alerts ?? []) as AlertRow[]} />
      </section>
    </main>
  );
}
