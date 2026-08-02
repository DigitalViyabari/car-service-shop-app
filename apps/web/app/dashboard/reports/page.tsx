"use client";

import type { InventoryItem, Invoice, JobSheet, Payment, Product } from "@dvcs/types";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";

type Period = "this_month" | "last_30" | "all";
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const labels: Record<string, string> = {
  check_in: "Check-In",
  inspection: "Inspection",
  estimate_pending: "Estimate Pending",
  approved: "Approved",
  in_progress: "In Progress",
  quality_check: "Quality Check",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
function dateOf(value: unknown) {
  if (typeof value === "object" && value && "toDate" in value)
    return (value as { toDate: () => Date }).toDate();
  return new Date(String(value));
}
function startFor(period: Period) {
  const now = new Date();
  if (period === "all") return null;
  if (period === "last_30") return new Date(now.getTime() - 30 * 86400000);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function ReportsPage() {
  const { memberships, activeCompanyId, activeBranchId, activeBranch } = useAuth(),
    [period, setPeriod] = useState<Period>("this_month"),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [jobs, setJobs] = useState<JobSheet[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const membership = memberships.find(({ companyId }) => companyId === activeCompanyId),
    canView =
      (membership?.companyRoles ?? []).some((role) =>
        ["company_owner", "company_admin", "company_accountant"].includes(role),
      ) ||
      (membership?.branchAssignments ?? []).some(
        ({ branchId, roles }) =>
          branchId === activeBranchId &&
          roles.some((role) => role === "branch_manager" || role === "finance_manager"),
      );
  const load = useCallback(async () => {
    if (!canView || !activeCompanyId || !activeBranchId) return;
    setLoading(true);
    setError("");
    try {
      const [invoiceDocs, paymentDocs, jobDocs, inventoryDocs, productDocs] = await Promise.all([
        getDocs(
          query(
            collection(firebaseClient.db, "invoices"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "payments"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "jobSheets"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "inventoryItems"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "products"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
      ]);
      setInvoices(invoiceDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Invoice));
      setPayments(paymentDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Payment));
      setJobs(jobDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as JobSheet));
      setInventory(
        inventoryDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as InventoryItem),
      );
      setProducts(productDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Product));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId, canView]);
  useEffect(() => {
    void load();
  }, [load]);
  const report = useMemo(() => {
    const start = startFor(period),
      includedInvoices = invoices.filter((item) => !start || dateOf(item.issuedAt) >= start),
      includedPayments = payments.filter(
        (item) => item.status === "completed" && (!start || dateOf(item.receivedAt) >= start),
      ),
      includedJobs = jobs.filter((item) => !start || dateOf(item.checkedInAt) >= start),
      billed = includedInvoices.reduce((sum, item) => sum + item.totalAmount, 0),
      collected = includedPayments.reduce((sum, item) => sum + item.amount, 0),
      outstanding = invoices
        .filter((item) => item.status !== "void")
        .reduce((sum, item) => sum + item.balanceAmount, 0),
      jobCounts = Object.entries(
        includedJobs.reduce<Record<string, number>>(
          (result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }),
          {},
        ),
      ).sort((a, b) => b[1] - a[1]),
      serviceCounts = Object.entries(
        includedJobs.reduce<Record<string, number>>(
          (result, item) => ({
            ...result,
            [item.serviceType || "Not Specified"]:
              (result[item.serviceType || "Not Specified"] ?? 0) + 1,
          }),
          {},
        ),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
      lowItems = inventory
        .filter((item) => item.status === "active" && item.currentStock <= item.reorderLevel)
        .sort((a, b) => a.currentStock - b.currentStock),
      stockValue = inventory
        .filter((item) => item.status === "active")
        .reduce((sum, item) => sum + item.currentStock * item.purchasePrice, 0);
    return {
      includedInvoices,
      includedPayments,
      includedJobs,
      billed,
      collected,
      outstanding,
      jobCounts,
      serviceCounts,
      lowItems,
      stockValue,
    };
  }, [inventory, invoices, jobs, payments, period]);
  function exportCsv() {
    const rows = [
        ["Branch", activeBranch?.name ?? ""],
        ["Period", period.replaceAll("_", " ")],
        ["Total Jobs", report.includedJobs.length],
        ["Billed", report.billed],
        ["Collected", report.collected],
        ["Outstanding", report.outstanding],
        ["Stock Value", report.stockValue],
        [],
        ["Invoice", "Customer", "Registration", "Total", "Paid", "Balance", "Status"],
        ...report.includedInvoices.map((item) => [
          item.invoiceNumber,
          item.customerName,
          item.registrationNumber,
          item.totalAmount,
          item.paidAmount,
          item.balanceAmount,
          item.status,
        ]),
      ],
      content = rows.map((row) => row.map(csvCell).join(",")).join("\n"),
      url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeBranch?.name ?? "branch"}-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  if (!canView)
    return (
      <main className="content">
        <div className="state-card">
          <h1>Reports Access Required</h1>
          <p>Reports are available to Owners, Branch Managers and Finance Managers.</p>
        </div>
      </main>
    );
  const maxJobs = Math.max(1, ...report.jobCounts.map(([, value]) => value)),
    maxServices = Math.max(1, ...report.serviceCounts.map(([, value]) => value));
  return (
    <main className="content reports-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">Business Intelligence</span>
          <h1>Reports &amp; Insights</h1>
          <p className="muted">
            Operational and financial performance for {activeBranch?.name ?? "this branch"}.
          </p>
        </div>
        <div className="report-actions">
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            <option value="this_month">This Month</option>
            <option value="last_30">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
          <button className="dv-button" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      {error ? <div className="alert alert--error module-alert">{error}</div> : null}
      {loading ? (
        <div className="list-state">
          <span className="spinner" />
          Preparing Reports…
        </div>
      ) : (
        <>
          <section className="report-kpis">
            <div>
              <span>Jobs Created</span>
              <strong>{report.includedJobs.length}</strong>
              <small>
                {report.includedJobs.filter((item) => item.status === "delivered").length} Delivered
              </small>
            </div>
            <div>
              <span>Revenue Billed</span>
              <strong>{money.format(report.billed)}</strong>
              <small>{report.includedInvoices.length} Invoices</small>
            </div>
            <div>
              <span>Collections</span>
              <strong>{money.format(report.collected)}</strong>
              <small>{report.includedPayments.length} Payments</small>
            </div>
            <div className={report.outstanding ? "is-warning" : ""}>
              <span>Outstanding</span>
              <strong>{money.format(report.outstanding)}</strong>
              <small>Current Branch Balance</small>
            </div>
            <div>
              <span>Inventory Value</span>
              <strong>{money.format(report.stockValue)}</strong>
              <small>{report.lowItems.length} Low Stock Items</small>
            </div>
          </section>
          <section className="report-grid">
            <article className="report-card">
              <header>
                <div>
                  <span className="heading-kicker">Workshop Flow</span>
                  <h2>Jobs By Status</h2>
                </div>
              </header>
              <div className="report-bars">
                {report.jobCounts.length ? (
                  report.jobCounts.map(([status, value]) => (
                    <div key={status}>
                      <label>
                        <span>{labels[status] ?? status}</span>
                        <strong>{value}</strong>
                      </label>
                      <i>
                        <b style={{ width: `${(value / maxJobs) * 100}%` }} />
                      </i>
                    </div>
                  ))
                ) : (
                  <p>No jobs in this period.</p>
                )}
              </div>
            </article>
            <article className="report-card">
              <header>
                <div>
                  <span className="heading-kicker">Demand</span>
                  <h2>Top Service Types</h2>
                </div>
              </header>
              <div className="report-bars report-bars--navy">
                {report.serviceCounts.length ? (
                  report.serviceCounts.map(([service, value]) => (
                    <div key={service}>
                      <label>
                        <span>{service}</span>
                        <strong>{value}</strong>
                      </label>
                      <i>
                        <b style={{ width: `${(value / maxServices) * 100}%` }} />
                      </i>
                    </div>
                  ))
                ) : (
                  <p>No service data in this period.</p>
                )}
              </div>
            </article>
            <article className="report-card report-card--wide">
              <header>
                <div>
                  <span className="heading-kicker">Inventory Attention</span>
                  <h2>Low &amp; Out Of Stock</h2>
                </div>
                <span className="report-count">{report.lowItems.length}</span>
              </header>
              {report.lowItems.length ? (
                <div className="low-stock-table">
                  {report.lowItems.slice(0, 10).map((item) => {
                    const product = products.find(({ id }) => id === item.productId);
                    return (
                      <div key={item.id}>
                        <span>
                          <strong>{product?.name ?? "Product"}</strong>
                          <small>{product?.sku ?? item.productId}</small>
                        </span>
                        <span>
                          {item.currentStock} / {item.reorderLevel} {product?.unit}
                        </span>
                        <em className={item.currentStock <= 0 ? "is-out" : ""}>
                          {item.currentStock <= 0 ? "Out Of Stock" : "Reorder"}
                        </em>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="report-empty">All tracked products are above their reorder levels.</p>
              )}
            </article>
          </section>
        </>
      )}
    </main>
  );
}
