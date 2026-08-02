"use client";

import { Card, StatusBadge } from "@dvcs/ui";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { activeCompany, activeBranch } = useAuth();

  if (!activeBranch) {
    return (
      <main className="content">
        <div className="state-card state-card--inline">
          <StatusBadge tone="warning">No branch</StatusBadge>
          <h1>Add or assign a branch</h1>
          <p className="muted">
            {activeCompany?.name ?? "This company"} does not have an accessible branch yet.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="content">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">{activeBranch.name} · Live workspace</span>
          <h1>Workshop overview</h1>
          <p className="muted">A clear view of today&apos;s service floor.</p>
        </div>
        <button className="quick-action" disabled title="Job creation is coming next"><strong>+</strong> New job card</button>
      </div>
      <div className="cards">
        <Card>
          <div className="metric-header"><span className="metric-label">Jobs today</span><span className="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 4h14v17H5zM8 2h8v4H8zM8 11h8M8 15h5"/></svg></span></div>
          <div className="metric">—</div>
          <p className="muted metric-foot">No job cards opened yet</p>
        </Card>
        <Card>
          <div className="metric-header"><span className="metric-label">Vehicles in service</span><span className="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 15.5 6.5 9h11l2.5 6.5M3 15.5h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Z"/><circle cx="7" cy="17.5" r="1"/><circle cx="17" cy="17.5" r="1"/></svg></span></div>
          <div className="metric">—</div>
          <p className="muted metric-foot">Service bay is ready</p>
        </Card>
        <Card>
          <div className="metric-header"><span className="metric-label">Branch revenue</span><span className="metric-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h3"/></svg></span></div>
          <div className="metric">—</div>
          <p className="muted metric-foot">No invoices raised yet</p>
        </Card>
      </div>
      <section className="activity-panel">
        <div className="activity-title">
          <div><h2>Service floor activity</h2><p>Live job movement will appear here.</p></div>
          <StatusBadge tone="neutral">Ready</StatusBadge>
        </div>
        <div className="empty-road"><span className="road-line" aria-hidden="true" /> Waiting for the first vehicle check-in</div>
      </section>
    </main>
  );
}
