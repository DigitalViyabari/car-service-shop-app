import Link from "next/link";
import { StatusBadge } from "@dvcs/ui";
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          DIGITAL <span>VIYABARI</span>
        </div>
        <nav className="nav">
          <Link href="/dashboard">Overview</Link>
          <span>Operations</span>
          <span>Inventory</span>
          <span>Finance</span>
          <span>Reports</span>
          <span>Team</span>
          <span>Settings</span>
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="selectors">
            <select aria-label="Company">
              <option>Viyabari Auto Group</option>
            </select>
            <select aria-label="Branch">
              <option>Anna Nagar Branch</option>
              <option>All branches</option>
            </select>
          </div>
          <StatusBadge>Subscription active</StatusBadge>
        </header>
        {children}
      </section>
      <nav className="mobile-nav">
        <Link href="/dashboard">Home</Link>
        <span>Jobs</span>
        <span>Stock</span>
        <span>More</span>
      </nav>
    </div>
  );
}
