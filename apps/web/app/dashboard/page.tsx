const tabs = [
  { label: "Jobseekers", href: "/dashboard/jobseekers" },
  { label: "Queue (Global)", href: "/dashboard/queue" },
  { label: "Needs Attention", href: "/dashboard/attention" },
  { label: "Applied / Completed", href: "/dashboard/applied" },
  { label: "Draft Outreach", href: "/dashboard/outreach" },
  { label: "Interview Prep", href: "/dashboard/interview-prep" },
];

export default function DashboardPage() {
  return (
    <main>
      <h1>AM Control Center</h1>
      <p>Phase 2 dashboard overview.</p>
      <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <a
            key={tab.href}
            href={tab.href}
            style={{
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </main>
  );
}
