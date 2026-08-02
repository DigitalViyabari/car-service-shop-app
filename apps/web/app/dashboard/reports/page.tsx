"use client";

import type { InventoryItem, Invoice, JobSheet, Payment, Product } from "@dvcs/types";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";

type PurchaseReportItem = {
  id: string;
  billDate: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
};
type ExpenseReportItem = { id: string; expenseDate: string; amount: number };

type Period =
  | "today"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "this_financial_year"
  | "last_financial_year"
  | "custom";
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
function dayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
function dateInputValue(value: Date) {
  const year = value.getFullYear(),
    month = String(value.getMonth() + 1).padStart(2, "0"),
    day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function rangeFor(period: Period, customStart: string, customEnd: string) {
  const now = new Date();
  const today = dayStart(now);
  if (period === "today") return [today, new Date(today.getTime() + 86400000)] as const;
  if (period === "last_7")
    return [
      new Date(today.getTime() - 6 * 86400000),
      new Date(today.getTime() + 86400000),
    ] as const;
  if (period === "last_30")
    return [
      new Date(today.getTime() - 29 * 86400000),
      new Date(today.getTime() + 86400000),
    ] as const;
  if (period === "this_month")
    return [
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    ] as const;
  if (period === "last_month")
    return [
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth(), 1),
    ] as const;
  if (period === "custom") {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : today,
      end = customEnd ? new Date(`${customEnd}T00:00:00`) : today;
    return [start, new Date(end.getTime() + 86400000)] as const;
  }
  const currentFinancialYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1,
    startYear = period === "last_financial_year" ? currentFinancialYear - 1 : currentFinancialYear;
  return [new Date(startYear, 3, 1), new Date(startYear + 1, 3, 1)] as const;
}
function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function ReportsPage() {
  const { memberships, activeCompanyId, activeBranchId, activeBranch } = useAuth(),
    [period, setPeriod] = useState<Period>("this_month"),
    [customStart, setCustomStart] = useState(dateInputValue(new Date())),
    [customEnd, setCustomEnd] = useState(dateInputValue(new Date())),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [jobs, setJobs] = useState<JobSheet[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [purchases, setPurchases] = useState<PurchaseReportItem[]>([]),
    [expenses, setExpenses] = useState<ExpenseReportItem[]>([]),
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
      const [
        invoiceDocs,
        paymentDocs,
        jobDocs,
        inventoryDocs,
        productDocs,
        purchaseDocs,
        expenseDocs,
      ] = await Promise.all([
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
        getDocs(
          query(
            collection(firebaseClient.db, "purchaseBills"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "expenses"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
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
      setPurchases(
        purchaseDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as PurchaseReportItem),
      );
      setExpenses(
        expenseDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as ExpenseReportItem),
      );
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
    const [start, end] = rangeFor(period, customStart, customEnd),
      inRange = (value: unknown) => {
        const date = dateOf(value);
        return date >= start && date < end;
      },
      includedInvoices = invoices.filter((item) => inRange(item.issuedAt)),
      includedPayments = payments.filter(
        (item) => item.status === "completed" && inRange(item.receivedAt),
      ),
      includedJobs = jobs.filter((item) => inRange(item.checkedInAt)),
      includedPurchases = purchases.filter((item) => inRange(item.billDate)),
      includedExpenses = expenses.filter((item) => inRange(item.expenseDate)),
      billed = includedInvoices.reduce((sum, item) => sum + item.totalAmount, 0),
      collected = includedPayments.reduce((sum, item) => sum + item.amount, 0),
      outstanding = includedInvoices
        .filter((item) => item.status !== "void")
        .reduce((sum, item) => sum + item.balanceAmount, 0),
      purchaseTotal = includedPurchases.reduce((sum, item) => sum + item.totalAmount, 0),
      expenseTotal = includedExpenses.reduce((sum, item) => sum + item.amount, 0),
      outputGst = includedInvoices.reduce((sum, item) => sum + item.taxAmount, 0),
      inputGst = includedPurchases.reduce((sum, item) => sum + item.taxAmount, 0),
      netCash = collected - purchaseTotal - expenseTotal,
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
      purchaseTotal,
      expenseTotal,
      outputGst,
      inputGst,
      netGst: Math.max(0, outputGst - inputGst),
      netCash,
      jobCounts,
      serviceCounts,
      lowItems,
      stockValue,
    };
  }, [customEnd, customStart, expenses, inventory, invoices, jobs, payments, period, purchases]);
  function exportCsv() {
    const rows = [
        ["Branch", activeBranch?.name ?? ""],
        ["Period", period.replaceAll("_", " ")],
        ["Total Jobs", report.includedJobs.length],
        ["Billed", report.billed],
        ["Collected", report.collected],
        ["Outstanding", report.outstanding],
        ["Purchases", report.purchaseTotal],
        ["Expenses", report.expenseTotal],
        ["Net Cash Movement", report.netCash],
        ["Output GST", report.outputGst],
        ["Input GST", report.inputGst],
        ["Estimated GST Payable", report.netGst],
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
    maxServices = Math.max(1, ...report.serviceCounts.map(([, value]) => value)),
    deliveredJobs = report.includedJobs.filter((item) => item.status === "delivered").length,
    completionRate = report.includedJobs.length
      ? Math.round((deliveredJobs / report.includedJobs.length) * 100)
      : 0,
    collectionRate = report.billed
      ? Math.min(100, Math.round((report.collected / report.billed) * 100))
      : 0,
    averageInvoice = report.includedInvoices.length
      ? report.billed / report.includedInvoices.length
      : 0;
  return (
    <main className="content reports-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">Business Intelligence</span>
          <h1>Reports</h1>
          <p className="muted">Workshop and financial performance.</p>
        </div>
        <div className="report-actions">
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            <option value="today">Today</option>
            <option value="last_7">Last 7 Days</option>
            <option value="last_30">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_financial_year">This Financial Year</option>
            <option value="last_financial_year">Last Financial Year</option>
            <option value="custom">Custom</option>
          </select>
          {period === "custom" ? (
            <div className="custom-report-range">
              <label>
                From
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <button className="dv-button" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      {error ? <div className="alert alert--error module-alert">{error}</div> : null}
      <section className="report-guide">
        <strong>How To Read This Report</strong>
        <span>
          <i className="is-good" /> Green means healthy or completed.
        </span>
        <span>
          <i className="is-active" /> Blue means active business.
        </span>
        <span>
          <i className="is-attention" /> Amber needs attention.
        </span>
        <span>
          <i className="is-urgent" /> Red requires action.
        </span>
      </section>
      {loading ? (
        <div className="list-state">
          <span className="spinner" />
          Preparing Reports…
        </div>
      ) : (
        <>
          <section className="report-kpis">
            <div className="kpi-blue">
              <span>Vehicles</span>
              <strong>{report.includedJobs.length}</strong>
              <small>
                {deliveredJobs} delivered · {completionRate}% completed
              </small>
            </div>
            <div className="kpi-navy">
              <span>Invoiced</span>
              <strong>{money.format(report.billed)}</strong>
              <small>Average invoice {money.format(averageInvoice)}</small>
            </div>
            <div className="kpi-green">
              <span>Collected</span>
              <strong>{money.format(report.collected)}</strong>
              <small>
                {report.includedPayments.length} payments · {collectionRate}% collected
              </small>
            </div>
            <div className={report.outstanding ? "kpi-amber" : "kpi-green"}>
              <span>Balance Due</span>
              <strong>{money.format(report.outstanding)}</strong>
              <small>
                {report.outstanding
                  ? "Follow up on unpaid invoices"
                  : "No payment follow-up needed"}
              </small>
            </div>
            <div className={report.lowItems.length ? "kpi-red" : "kpi-green"}>
              <span>Stock Value</span>
              <strong>{money.format(report.stockValue)}</strong>
              <small>
                {report.lowItems.length
                  ? `${report.lowItems.length} products need attention`
                  : "All stock levels look healthy"}
              </small>
            </div>
            <div className="kpi-amber">
              <span>Purchases</span>
              <strong>{money.format(report.purchaseTotal)}</strong>
              <small>Stock bought in this period</small>
            </div>
            <div className="kpi-red">
              <span>Expenses</span>
              <strong>{money.format(report.expenseTotal)}</strong>
              <small>Workshop operating costs</small>
            </div>
            <div className={report.netCash >= 0 ? "kpi-green" : "kpi-red"}>
              <span>Net Cash Movement</span>
              <strong>{money.format(report.netCash)}</strong>
              <small>Collected minus purchases and expenses</small>
            </div>
            <div className={report.netGst ? "kpi-amber" : "kpi-green"}>
              <span>Estimated GST Payable</span>
              <strong>{money.format(report.netGst)}</strong>
              <small>Output GST less eligible input GST</small>
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
