"use client";

import { StatusBadge } from "@dvcs/ui";
import type { InventoryItem, Invoice, JobSheet, JobStatus, Payment } from "@dvcs/types";
import { collection, getDocs, query, where } from "firebase/firestore";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const statusLabels: Record<string, string> = {
  check_in: "Checked In",
  inspection: "Under Inspection",
  estimate_pending: "Waiting For Estimate",
  approved: "Approved",
  in_progress: "Work In Progress",
  quality_check: "Quality Check",
  ready: "Ready For Delivery",
};

export default function DashboardPage() {
  const { activeCompany, activeBranch, activeCompanyId, activeBranchId, memberships } = useAuth(),
    [jobs, setJobs] = useState<JobSheet[]>([]),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const membership = memberships.find(({ companyId }) => companyId === activeCompanyId),
    companyRoles = membership?.companyRoles ?? [],
    branchRoles =
      (membership?.branchAssignments ?? []).find(({ branchId }) => branchId === activeBranchId)
        ?.roles ?? [],
    canViewFinance =
      companyRoles.some((role) =>
        ["company_owner", "company_admin", "company_accountant"].includes(role),
      ) || branchRoles.some((role) => role === "branch_manager" || role === "finance_manager"),
    canViewInventory =
      companyRoles.some((role) => role === "company_owner" || role === "company_admin") ||
      branchRoles.some((role) => role === "branch_manager" || role === "inventory_manager"),
    canCreateJob =
      companyRoles.some((role) => role === "company_owner" || role === "company_admin") ||
      branchRoles.some((role) => role === "branch_manager" || role === "job_creator");
  const load = useCallback(async () => {
    if (!activeCompanyId || !activeBranchId) return;
    setLoading(true);
    setError("");
    try {
      const jobPromise = getDocs(
          query(
            collection(firebaseClient.db, "jobSheets"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        invoicePromise = canViewFinance
          ? getDocs(
              query(
                collection(firebaseClient.db, "invoices"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            )
          : null,
        paymentPromise = canViewFinance
          ? getDocs(
              query(
                collection(firebaseClient.db, "payments"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            )
          : null,
        inventoryPromise = canViewInventory
          ? getDocs(
              query(
                collection(firebaseClient.db, "inventoryItems"),
                where("companyId", "==", activeCompanyId),
                where("branchId", "==", activeBranchId),
              ),
            )
          : null,
        [jobDocs, invoiceDocs, paymentDocs, inventoryDocs] = await Promise.all([
          jobPromise,
          invoicePromise,
          paymentPromise,
          inventoryPromise,
        ]);
      setJobs(jobDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as JobSheet));
      setInvoices(
        invoiceDocs?.docs.map((item) => ({ ...item.data(), id: item.id }) as Invoice) ?? [],
      );
      setPayments(
        paymentDocs?.docs.map((item) => ({ ...item.data(), id: item.id }) as Payment) ?? [],
      );
      setInventory(
        inventoryDocs?.docs.map((item) => ({ ...item.data(), id: item.id }) as InventoryItem) ?? [],
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the workshop summary.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId, canViewFinance, canViewInventory]);
  useEffect(() => {
    void load();
  }, [load]);
  const summary = useMemo(() => {
    const inactive: JobStatus[] = ["delivered", "cancelled"],
      activeJobs = jobs.filter(({ status }) => !inactive.includes(status)),
      today = new Date().toDateString(),
      todayJobs = jobs.filter((item) => {
        const value = item.checkedInAt as unknown;
        const date =
          typeof value === "object" && value && "toDate" in value
            ? (value as { toDate: () => Date }).toDate()
            : new Date(String(value));
        return date.toDateString() === today;
      }),
      ready = activeJobs.filter(({ status }) => status === "ready").length,
      urgent = activeJobs.filter(
        ({ priority }) => priority === "urgent" || priority === "breakdown",
      ).length,
      outstanding = invoices
        .filter(({ status }) => status !== "void")
        .reduce((sum, item) => sum + item.balanceAmount, 0),
      collected = payments
        .filter(({ status }) => status === "completed")
        .reduce((sum, item) => sum + item.amount, 0),
      lowStock = inventory.filter(
        (item) => item.status === "active" && item.currentStock <= item.reorderLevel,
      ).length,
      statuses = Object.entries(
        activeJobs.reduce<Record<string, number>>(
          (result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }),
          {},
        ),
      );
    return { activeJobs, todayJobs, ready, urgent, outstanding, collected, lowStock, statuses };
  }, [inventory, invoices, jobs, payments]);
  if (!activeBranch)
    return (
      <main className="content">
        <div className="state-card state-card--inline">
          <StatusBadge tone="warning">Branch Setup Needed</StatusBadge>
          <h1>Add Or Assign A Branch</h1>
          <p className="muted">
            {activeCompany?.name ?? "This company"} does not have an accessible branch yet.
          </p>
        </div>
      </main>
    );
  return (
    <main className="content overview-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">{activeBranch.name} · Live Workshop</span>
          <h1>Good Day! Here&apos;s What Needs Your Attention</h1>
          <p className="muted">A simple, live summary of vehicles, work, payments and stock.</p>
        </div>
        {canCreateJob ? (
          <Link href="/dashboard/jobs" className="quick-action quick-action--enabled">
            <strong>+</strong> Create New Job
          </Link>
        ) : null}
      </div>
      {error ? <div className="alert alert--error module-alert">{error}</div> : null}
      <section className="overview-legend">
        <span>
          <i className="is-good" />
          Healthy / Completed
        </span>
        <span>
          <i className="is-active" />
          Work In Progress
        </span>
        <span>
          <i className="is-attention" />
          Needs Attention
        </span>
        <span>
          <i className="is-urgent" />
          Urgent / Overdue
        </span>
      </section>
      {loading ? (
        <div className="list-state">
          <span className="spinner" />
          Checking Today&apos;s Workshop…
        </div>
      ) : (
        <>
          <section className="overview-kpis">
            <article className="tone-blue">
              <span>Vehicles Being Serviced</span>
              <strong>{summary.activeJobs.length}</strong>
              <p>Job cards currently open on the workshop floor.</p>
              <small>{summary.todayJobs.length} checked in today</small>
            </article>
            <article className={summary.ready ? "tone-green" : "tone-neutral"}>
              <span>Ready For Customer</span>
              <strong>{summary.ready}</strong>
              <p>Vehicles that completed work and can be delivered.</p>
              <small>
                {summary.ready ? "Contact these customers" : "Nothing waiting for delivery"}
              </small>
            </article>
            <article className={summary.urgent ? "tone-red" : "tone-green"}>
              <span>Urgent Jobs</span>
              <strong>{summary.urgent}</strong>
              <p>Urgent or breakdown vehicles requiring priority.</p>
              <small>{summary.urgent ? "Action recommended now" : "No urgent work"}</small>
            </article>
            {canViewFinance ? (
              <article className={summary.outstanding ? "tone-amber" : "tone-green"}>
                <span>Payment Still To Collect</span>
                <strong>{money.format(summary.outstanding)}</strong>
                <p>Unpaid balance across all active invoices.</p>
                <small>{money.format(summary.collected)} collected overall</small>
              </article>
            ) : null}
            {canViewInventory ? (
              <article className={summary.lowStock ? "tone-amber" : "tone-green"}>
                <span>Products To Reorder</span>
                <strong>{summary.lowStock}</strong>
                <p>Stock at or below its selected reorder level.</p>
                <small>
                  {summary.lowStock ? "Review inventory today" : "Stock levels look healthy"}
                </small>
              </article>
            ) : null}
          </section>
          <section className="overview-grid">
            <article className="overview-panel">
              <header>
                <div>
                  <span className="heading-kicker">Live Process</span>
                  <h2>Where Every Vehicle Is Now</h2>
                  <p>Each number shows how many open jobs are at that step.</p>
                </div>
                <Link href="/dashboard/jobs">Open Job Cards →</Link>
              </header>
              {summary.statuses.length ? (
                <div className="process-list">
                  {summary.statuses.map(([status, count]) => (
                    <div key={status} className={`process-${status}`}>
                      <i />
                      <span>
                        <strong>{statusLabels[status] ?? status.replaceAll("_", " ")}</strong>
                        <small>
                          {status === "estimate_pending"
                            ? "Prepare or send the estimate"
                            : status === "ready"
                              ? "Customer can be informed"
                              : "Workshop process is active"}
                        </small>
                      </span>
                      <b>{count}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="friendly-empty">
                  <strong>No Vehicles In Service</strong>
                  <p>Create a job card when the next customer arrives.</p>
                </div>
              )}
            </article>
            <article className="overview-panel overview-help">
              <header>
                <div>
                  <span className="heading-kicker">Quick Guide</span>
                  <h2>What Should I Do Next?</h2>
                  <p>The system highlights the most useful next action.</p>
                </div>
              </header>
              <div className="next-actions">
                {summary.urgent > 0 ? (
                  <Link href="/dashboard/jobs" className="action-red">
                    <strong>
                      Handle {summary.urgent} Urgent Job{summary.urgent > 1 ? "s" : ""}
                    </strong>
                    <span>Open the job cards and update their progress.</span>
                  </Link>
                ) : null}
                {summary.ready > 0 ? (
                  <Link href="/dashboard/jobs" className="action-green">
                    <strong>
                      Deliver {summary.ready} Ready Vehicle{summary.ready > 1 ? "s" : ""}
                    </strong>
                    <span>Contact customers and complete delivery.</span>
                  </Link>
                ) : null}
                {canViewFinance && summary.outstanding > 0 ? (
                  <Link href="/dashboard/invoices" className="action-amber">
                    <strong>Collect Pending Payments</strong>
                    <span>{money.format(summary.outstanding)} remains outstanding.</span>
                  </Link>
                ) : null}
                {canViewInventory && summary.lowStock > 0 ? (
                  <Link href="/dashboard/products" className="action-blue">
                    <strong>
                      Reorder {summary.lowStock} Product{summary.lowStock > 1 ? "s" : ""}
                    </strong>
                    <span>Review low stock before workshop supply runs out.</span>
                  </Link>
                ) : null}
                {!summary.urgent &&
                !summary.ready &&
                (!canViewFinance || !summary.outstanding) &&
                (!canViewInventory || !summary.lowStock) ? (
                  <div className="all-clear">
                    <strong>Everything Looks Under Control</strong>
                    <span>No urgent action is required right now.</span>
                  </div>
                ) : null}
              </div>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
