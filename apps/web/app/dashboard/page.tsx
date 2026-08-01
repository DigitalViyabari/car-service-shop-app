import { Card, StatusBadge } from "@dvcs/ui";
export default function DashboardPage() {
  return (
    <main className="content">
      <StatusBadge tone="neutral">Anna Nagar Branch</StatusBadge>
      <h1>Workshop overview</h1>
      <p className="muted">
        A responsive shell with temporary sample data. Operational modules are intentionally not
        implemented.
      </p>
      <div className="cards">
        <Card>
          <span className="muted">Jobs today</span>
          <div className="metric">—</div>
          <p className="muted">No data connected</p>
        </Card>
        <Card>
          <span className="muted">Vehicles in service</span>
          <div className="metric">—</div>
          <p className="muted">No data connected</p>
        </Card>
        <Card>
          <span className="muted">Branch revenue</span>
          <div className="metric">—</div>
          <p className="muted">No data connected</p>
        </Card>
      </div>
    </main>
  );
}
