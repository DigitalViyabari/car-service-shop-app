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
      <StatusBadge tone="neutral">{activeBranch.name}</StatusBadge>
      <h1>Workshop overview</h1>
      <p className="muted">
        Signed-in tenant context is active. Operational modules remain intentionally empty.
      </p>
      <div className="cards">
        <Card>
          <span className="muted">Jobs today</span>
          <div className="metric">—</div>
          <p className="muted">No job data yet</p>
        </Card>
        <Card>
          <span className="muted">Vehicles in service</span>
          <div className="metric">—</div>
          <p className="muted">No vehicle data yet</p>
        </Card>
        <Card>
          <span className="muted">Branch revenue</span>
          <div className="metric">—</div>
          <p className="muted">No financial data yet</p>
        </Card>
      </div>
    </main>
  );
}
