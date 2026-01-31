"use client";

type AlertRow = {
  id: string;
  severity: string;
  type: string;
  message: string;
  created_at?: string;
};

export default function AlertsList({ alerts }: { alerts: AlertRow[] }) {
  const handleResolve = async (alertId: string) => {
    await fetch(`/api/ops/alerts/${alertId}/resolve`, { method: "POST" });
    window.location.reload();
  };

  if (alerts.length === 0) {
    return <p>No active alerts.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "12px",
            display: "grid",
            gap: "6px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <strong>{alert.type}</strong>
            <span>{alert.severity}</span>
          </div>
          <p style={{ margin: 0 }}>{alert.message}</p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <small>{alert.created_at ?? ""}</small>
            <button type="button" onClick={() => handleResolve(alert.id)}>
              Resolve
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
