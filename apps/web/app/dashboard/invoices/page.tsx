"use client";

import type {
  BusinessTaxProfile,
  Customer,
  Invoice,
  InvoiceLine,
  JobLineItem,
  JobSheet,
  Payment,
  PaymentMethod,
} from "@dvcs/types";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient, getFirebaseAppCheckToken } from "@/lib/firebase-client";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const methods: Array<[PaymentMethod, string]> = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["bank_transfer", "Bank Transfer"],
  ["cheque", "Cheque"],
  ["other", "Other"],
];
function shownDate(value: unknown) {
  if (!value) return "—";
  if (typeof value === "object" && value && "toDate" in value)
    return (value as { toDate: () => Date }).toDate().toLocaleString("en-IN");
  return new Date(String(value)).toLocaleString("en-IN");
}
function paymentDate(value: unknown) {
  if (typeof value === "object" && value && "toDate" in value)
    return (value as { toDate: () => Date }).toDate();
  return new Date(String(value));
}

export default function InvoicesPage() {
  const { user, memberships, activeCompany, activeCompanyId, activeBranchId, activeBranch } =
    useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]),
    [jobs, setJobs] = useState<JobSheet[]>([]),
    [lines, setLines] = useState<JobLineItem[]>([]),
    [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]);
  const [taxProfile, setTaxProfile] = useState<BusinessTaxProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false),
    [jobId, setJobId] = useState(""),
    [dueAt, setDueAt] = useState(""),
    [notes, setNotes] = useState("");
  const [showPayment, setShowPayment] = useState(false),
    [paymentAmount, setPaymentAmount] = useState(""),
    [method, setMethod] = useState<PaymentMethod>("upi"),
    [reference, setReference] = useState(""),
    [paymentNotes, setPaymentNotes] = useState(""),
    [receipt, setReceipt] = useState<Payment | null>(null),
    [printInvoice, setPrintInvoice] = useState(false),
    [reversalReason, setReversalReason] = useState("");

  const membership = memberships.find(({ companyId }) => companyId === activeCompanyId),
    companyFinanceRole = (membership?.companyRoles ?? []).some((role) =>
      ["company_owner", "company_admin", "company_accountant"].includes(role),
    ),
    branchFinanceRole = (membership?.branchAssignments ?? []).some(
      ({ branchId, roles }) =>
        branchId === activeBranchId &&
        roles.some((role) => role === "branch_manager" || role === "finance_manager"),
    ),
    canManageFinance = companyFinanceRole || branchFinanceRole;

  const load = useCallback(async () => {
    if (!canManageFinance || !activeCompanyId || !activeBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const [
        invoiceDocs,
        jobDocs,
        lineDocs,
        invoiceLineDocs,
        paymentDocs,
        customerDocs,
        taxProfileDoc,
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
            collection(firebaseClient.db, "jobSheets"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "jobLineItems"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "invoiceLines"),
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
            collection(firebaseClient.db, "customers"),
            where("companyId", "==", activeCompanyId),
            where("branchId", "==", activeBranchId),
          ),
        ),
        getDoc(doc(firebaseClient.db, "businessTaxProfiles", activeCompanyId)),
      ]);
      const nextInvoices = invoiceDocs.docs
        .map((item) => ({ ...item.data(), id: item.id }) as Invoice)
        .sort((a, b) => b.invoiceNumber.localeCompare(a.invoiceNumber));
      setInvoices(nextInvoices);
      setJobs(jobDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as JobSheet));
      setLines(
        lineDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as JobLineItem)
          .filter(({ status }) => status === "active"),
      );
      setInvoiceLines(
        invoiceLineDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as InvoiceLine),
      );
      setPayments(paymentDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Payment));
      setCustomers(customerDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Customer));
      setTaxProfile(
        taxProfileDoc.exists()
          ? ({ ...taxProfileDoc.data(), id: taxProfileDoc.id } as BusinessTaxProfile)
          : null,
      );
      setSelectedId((current) =>
        current && nextInvoices.some(({ id }) => id === current)
          ? current
          : (nextInvoices[0]?.id ?? null),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId, canManageFinance]);
  useEffect(() => {
    void load();
  }, [load]);

  const selected = invoices.find(({ id }) => id === selectedId) ?? null;
  const selectedInvoiceLines = invoiceLines.filter(({ invoiceId }) => invoiceId === selectedId);
  const selectedCustomer = customers.find(({ id }) => id === selected?.customerId);
  const invoiceableJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.approvalStatus === "approved" &&
          job.estimateLocked &&
          job.estimateTotal > 0 &&
          !invoices.some(({ jobId: item }) => item === job.id),
      ),
    [invoices, jobs],
  );
  const selectedJob = jobs.find(({ id }) => id === jobId),
    selectedJobLines = lines.filter((line) => line.jobId === jobId);
  const selectedPayments = payments
    .filter(({ invoiceId }) => invoiceId === selectedId)
    .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  const todayKey = new Date().toLocaleDateString("en-CA"),
    collectedToday = payments
      .filter(
        ({ receivedAt, status }) =>
          status === "completed" &&
          paymentDate(receivedAt).toLocaleDateString("en-CA") === todayKey,
      )
      .reduce((sum, item) => sum + item.amount, 0);
  const totals = {
    billed: invoices.reduce((sum, item) => sum + item.totalAmount, 0),
    collected: invoices.reduce((sum, item) => sum + item.paidAmount, 0),
    due: invoices.reduce((sum, item) => sum + item.balanceAmount, 0),
    open: invoices.filter(({ balanceAmount, status }) => balanceAmount > 0 && status !== "void")
      .length,
  };

  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    if (
      !user ||
      !activeCompanyId ||
      !activeBranchId ||
      !selectedJob ||
      selectedJobLines.length === 0
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      const invoiceRef = doc(firebaseClient.db, "invoices", selectedJob.id);
      if ((await getDoc(invoiceRef)).exists())
        throw new Error("An invoice already exists for this job.");
      const taxable = selectedJobLines.reduce((sum, line) => sum + line.taxableAmount, 0),
        tax = selectedJobLines.reduce((sum, line) => sum + line.taxAmount, 0),
        total = selectedJobLines.reduce((sum, line) => sum + line.totalAmount, 0),
        now = serverTimestamp();
      const invoiceNumber = selectedJob.jobNumber,
        batch = writeBatch(firebaseClient.db);
      batch.set(invoiceRef, {
        companyId: activeCompanyId,
        branchId: activeBranchId,
        jobId: selectedJob.id,
        invoiceNumber,
        customerId: selectedJob.customerId,
        customerName: selectedJob.customerName,
        vehicleId: selectedJob.vehicleId,
        vehicleLabel: selectedJob.vehicleLabel,
        registrationNumber: selectedJob.registrationNumber,
        taxableAmount: taxable,
        taxAmount: tax,
        totalAmount: total,
        paidAmount: 0,
        balanceAmount: total,
        status: "issued",
        issuedAt: now,
        dueAt: dueAt || null,
        notes: notes.trim(),
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
      selectedJobLines.forEach((line) =>
        batch.set(doc(collection(firebaseClient.db, "invoiceLines")), {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          invoiceId: invoiceRef.id,
          jobLineItemId: line.id,
          type: line.type,
          productId: line.productId ?? null,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          discount: line.discount,
          gstRate: line.gstRate,
          taxableAmount: line.taxableAmount,
          taxAmount: line.taxAmount,
          totalAmount: line.totalAmount,
          createdAt: now,
          createdBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        }),
      );
      batch.update(doc(firebaseClient.db, "jobSheets", selectedJob.id), {
        invoiceTotal: total,
        updatedAt: now,
        updatedBy: user.uid,
      });
      await batch.commit();
      setShowCreate(false);
      setJobId("");
      setDueAt("");
      setNotes("");
      await load();
      setSelectedId(invoiceRef.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to issue invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!user || !selected || !activeCompanyId || !activeBranchId) return;
    const amount = Number(paymentAmount);
    if (amount <= 0 || amount > selected.balanceAmount + 0.001) {
      setError("Payment must be greater than zero and cannot exceed the balance.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const paymentRef = doc(collection(firebaseClient.db, "payments")),
        date = new Date().toISOString().slice(2, 10).replaceAll("-", ""),
        receiptNumber = `RCPT-${date}-${paymentRef.id.slice(0, 5).toUpperCase()}`;
      await runTransaction(firebaseClient.db, async (transaction) => {
        const invoiceRef = doc(firebaseClient.db, "invoices", selected.id),
          snapshot = await transaction.get(invoiceRef);
        if (!snapshot.exists()) throw new Error("Invoice no longer exists.");
        const current = snapshot.data() as Invoice,
          balance = Number(current.balanceAmount),
          paid = Number(current.paidAmount);
        if (amount > balance + 0.001) throw new Error("Payment exceeds the latest balance.");
        const nextPaid = paid + amount,
          nextBalance = Math.max(0, balance - amount),
          now = serverTimestamp();
        transaction.update(invoiceRef, {
          paidAmount: nextPaid,
          balanceAmount: nextBalance,
          status: nextBalance <= 0.001 ? "paid" : "part_paid",
          updatedAt: now,
          updatedBy: user.uid,
        });
        transaction.set(paymentRef, {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          invoiceId: selected.id,
          jobId: selected.jobId,
          receiptNumber,
          amount,
          method,
          reference: reference.trim(),
          notes: paymentNotes.trim(),
          receivedAt: now,
          status: "completed",
          createdAt: now,
          createdBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        });
      });
      setShowPayment(false);
      setPaymentAmount("");
      setReference("");
      setPaymentNotes("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reversePayment() {
    if (!user || !receipt || !activeCompanyId || !activeBranchId || !reversalReason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const [idToken, appCheck] = await Promise.all([
          user.getIdToken(),
          getFirebaseAppCheckToken(),
        ]),
        response = await fetch("/api/v1/payments/reverse", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${idToken}`,
            "x-firebase-appcheck": appCheck,
          },
          body: JSON.stringify({
            companyId: activeCompanyId,
            branchId: activeBranchId,
            paymentId: receipt.id,
            reason: reversalReason.trim(),
          }),
        }),
        result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to reverse payment.");
      setReceipt(null);
      setReversalReason("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reverse payment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManageFinance)
    return (
      <main className="content">
        <div className="state-card">
          <h1>Finance Access Required</h1>
          <p>
            This finance workspace is available to Owners, Branch Managers and Finance Managers.
          </p>
        </div>
      </main>
    );

  return (
    <main className="content invoices-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">Branch Finance</span>
          <h1>Invoices &amp; Payments</h1>
          <p className="muted">Invoices, collections and balances.</p>
        </div>
        <button
          className="quick-action quick-action--enabled"
          disabled={invoiceableJobs.length === 0}
          onClick={() => {
            setError(null);
            setShowCreate(true);
            setJobId(invoiceableJobs[0]?.id ?? "");
          }}
        >
          <strong>+</strong> Issue Invoice
        </button>
      </div>
      {error && !showCreate && !showPayment ? (
        <div className="alert alert--error module-alert">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      ) : null}
      <section className="finance-legend">
        <strong>Payment Guide</strong>
        <span>
          <i className="is-good" /> Paid — nothing remains
        </span>
        <span>
          <i className="is-attention" /> Part Paid — collect the balance
        </span>
        <span>
          <i className="is-active" /> Issued — waiting for payment
        </span>
        <span>
          <i className="is-urgent" /> Outstanding — follow up required
        </span>
      </section>
      <section className="invoice-summary">
        <div className="finance-blue">
          <span>Invoiced</span>
          <strong>{money.format(totals.billed)}</strong>
        </div>
        <div className="finance-green">
          <span>Today</span>
          <strong>{money.format(collectedToday)}</strong>
        </div>
        <div className="finance-navy">
          <span>Collected</span>
          <strong>{money.format(totals.collected)}</strong>
        </div>
        <div className={totals.due ? "finance-amber" : "finance-green"}>
          <span>Balance Due</span>
          <strong>{money.format(totals.due)}</strong>
          <small>{totals.due ? "Customer follow-up required" : "All invoices are settled"}</small>
        </div>
        <div className={totals.open ? "finance-red" : "finance-green"}>
          <span>Unpaid Invoices</span>
          <strong>{totals.open}</strong>
          <small>{totals.open ? "Open these invoices to collect" : "No unpaid invoices"}</small>
        </div>
      </section>
      <section className="invoice-workspace">
        <div className="invoice-directory">
          <div className="invoice-directory-head">
            <strong>Branch Invoices</strong>
            <span>{invoices.length}</span>
          </div>
          {loading ? (
            <div className="list-state">
              <span className="spinner" />
              Loading Invoices…
            </div>
          ) : invoices.length === 0 ? (
            <div className="list-state list-state--empty">
              <strong>No Invoices Yet</strong>
              <p>Approve an estimate, then issue its invoice.</p>
            </div>
          ) : (
            invoices.map((invoice) => (
              <button
                key={invoice.id}
                className={`invoice-row ${selectedId === invoice.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(invoice.id)}
              >
                <span>
                  <strong>{invoice.invoiceNumber}</strong>
                  <small>
                    {invoice.customerName} · {invoice.registrationNumber}
                  </small>
                </span>
                <span>
                  <strong>{money.format(invoice.totalAmount)}</strong>
                  <em className={`invoice-status invoice-status-${invoice.status}`}>
                    {invoice.status.replace("_", " ")}
                  </em>
                </span>
              </button>
            ))
          )}
        </div>
        <aside className="invoice-detail">
          {selected ? (
            <>
              <div className="invoice-detail-head">
                <div>
                  <span className="heading-kicker">{selected.invoiceNumber}</span>
                  <h2>{selected.customerName}</h2>
                  <p>
                    {selected.registrationNumber} · {selected.vehicleLabel}
                  </p>
                </div>
                <div className="invoice-head-actions">
                  <span className={`invoice-status invoice-status-${selected.status}`}>
                    {selected.status.replace("_", " ")}
                  </span>
                  <button type="button" onClick={() => setPrintInvoice(true)}>
                    Print Invoice
                  </button>
                </div>
              </div>
              <div className="invoice-amount">
                <span>Customer Still Needs To Pay</span>
                <strong>{money.format(selected.balanceAmount)}</strong>
                <small>Invoice Total {money.format(selected.totalAmount)}</small>
              </div>
              <div
                className={`payment-explainer ${selected.balanceAmount > 0 ? "needs-payment" : "is-settled"}`}
              >
                <strong>
                  {selected.balanceAmount > 0
                    ? "Payment Follow-Up Needed"
                    : "Invoice Fully Settled"}
                </strong>
                <span>
                  {selected.balanceAmount > 0
                    ? `Record a full or partial payment when the customer pays. ${money.format(selected.paidAmount)} has already been received.`
                    : "The full invoice amount has been received. No collection action remains."}
                </span>
              </div>
              <div className="invoice-breakdown">
                <span>
                  Taxable <strong>{money.format(selected.taxableAmount)}</strong>
                </span>
                <span>
                  GST <strong>{money.format(selected.taxAmount)}</strong>
                </span>
                <span>
                  Paid <strong>{money.format(selected.paidAmount)}</strong>
                </span>
                <span>
                  Issued <strong>{shownDate(selected.issuedAt)}</strong>
                </span>
              </div>
              {selected.balanceAmount > 0 && selected.status !== "void" ? (
                <button
                  className="dv-button receive-payment"
                  onClick={() => {
                    setPaymentAmount(String(selected.balanceAmount));
                    setError(null);
                    setShowPayment(true);
                  }}
                >
                  Record Payment
                </button>
              ) : null}
              <section className="payment-history">
                <div>
                  <span className="heading-kicker">Receipts</span>
                  <h3>Payment History</h3>
                </div>
                {selectedPayments.length === 0 ? (
                  <p>No payments recorded.</p>
                ) : (
                  selectedPayments.map((payment) => (
                    <article
                      key={payment.id}
                      className={payment.status === "reversed" ? "is-reversed" : ""}
                    >
                      <span>
                        <strong>{payment.receiptNumber}</strong>
                        <small>
                          {shownDate(payment.receivedAt)} ·{" "}
                          {methods.find(([value]) => value === payment.method)?.[1]}
                        </small>
                      </span>
                      <span className="receipt-actions">
                        <strong>{money.format(payment.amount)}</strong>
                        <button
                          type="button"
                          onClick={() => {
                            setReceipt(payment);
                            setError(null);
                          }}
                        >
                          View Receipt
                        </button>
                      </span>
                    </article>
                  ))
                )}
              </section>
            </>
          ) : (
            <div className="detail-empty">
              <h2>Select An Invoice</h2>
              <p>Choose an invoice to view details.</p>
            </div>
          )}
        </aside>
      </section>
      {showCreate ? (
        <div className="modal-backdrop">
          <form className="module-modal" onSubmit={createInvoice}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Approved Work</span>
                <h2>Issue Invoice</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="form-grid">
              <label className="span-2">
                Approved Job
                <select value={jobId} onChange={(event) => setJobId(event.target.value)} required>
                  {invoiceableJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.jobNumber} · {job.customerName} · {job.registrationNumber} ·{" "}
                      {money.format(job.estimateTotal)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due Date
                <input
                  type="date"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
              <label className="span-2">
                Invoice Notes
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Warranty, payment or delivery notes"
                />
              </label>
              <div className="span-2 invoice-preview">
                <span>
                  Items <strong>{selectedJobLines.length}</strong>
                </span>
                <span>
                  Invoice Total <strong>{money.format(selectedJob?.estimateTotal ?? 0)}</strong>
                </span>
              </div>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="dv-button" disabled={submitting || !jobId}>
                {submitting ? "Issuing…" : "Issue Locked Invoice"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showPayment && selected ? (
        <div className="modal-backdrop">
          <form className="module-modal payment-modal" onSubmit={recordPayment}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">{selected.invoiceNumber}</span>
                <h2>Record Payment</h2>
              </div>
              <button type="button" onClick={() => setShowPayment(false)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="form-grid">
              <label>
                Amount Received
                <input
                  type="number"
                  min="0.01"
                  max={selected.balanceAmount}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  required
                />
              </label>
              <label>
                Payment Method
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                >
                  {methods.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                Transaction / Reference
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="UPI, card, bank or cheque reference"
                />
              </label>
              <label className="span-2">
                Notes
                <textarea
                  rows={2}
                  value={paymentNotes}
                  onChange={(event) => setPaymentNotes(event.target.value)}
                />
              </label>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setShowPayment(false)}>
                Cancel
              </button>
              <button className="dv-button" disabled={submitting}>
                {submitting ? "Recording…" : "Record & Generate Receipt"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {receipt && selected ? (
        <div className="modal-backdrop receipt-backdrop">
          <section className="module-modal receipt-modal" role="dialog" aria-modal="true">
            <header className="modal-header no-print">
              <div>
                <span className="heading-kicker">Payment Receipt</span>
                <h2>{receipt.receiptNumber}</h2>
              </div>
              <button type="button" onClick={() => setReceipt(null)}>
                ×
              </button>
            </header>
            <div className="receipt-sheet">
              <div className="receipt-brand">
                <strong>{activeCompany?.name ?? "Digital Viyabari"}</strong>
                <span>{activeBranch?.name}</span>
              </div>
              <div className="receipt-paid">
                <span>Amount Received</span>
                <strong>{money.format(receipt.amount)}</strong>
                <em>{receipt.status === "reversed" ? "Reversed" : "Payment Successful"}</em>
              </div>
              <dl>
                <div>
                  <dt>Customer</dt>
                  <dd>{selected.customerName}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>
                    {selected.registrationNumber} · {selected.vehicleLabel}
                  </dd>
                </div>
                <div>
                  <dt>Invoice</dt>
                  <dd>{selected.invoiceNumber}</dd>
                </div>
                <div>
                  <dt>Payment Method</dt>
                  <dd>{methods.find(([value]) => value === receipt.method)?.[1]}</dd>
                </div>
                <div>
                  <dt>Received At</dt>
                  <dd>{shownDate(receipt.receivedAt)}</dd>
                </div>
                {receipt.reference ? (
                  <div>
                    <dt>Reference</dt>
                    <dd>{receipt.reference}</dd>
                  </div>
                ) : null}
              </dl>
              {receipt.notes ? <p className="receipt-note">{receipt.notes}</p> : null}
            </div>
            {error ? <div className="alert alert--error modal-alert no-print">{error}</div> : null}
            <footer className="modal-footer no-print receipt-footer">
              {receipt.status === "completed" ? (
                <label>
                  Reversal Reason
                  <input
                    value={reversalReason}
                    onChange={(event) => setReversalReason(event.target.value)}
                    placeholder="Required for audit history"
                  />
                </label>
              ) : null}
              {receipt.status === "completed" ? (
                <button
                  type="button"
                  className="cancel-button"
                  disabled={!reversalReason.trim() || submitting}
                  onClick={() => void reversePayment()}
                >
                  {submitting ? "Reversing…" : "Reverse Payment"}
                </button>
              ) : null}
              <button type="button" className="dv-button" onClick={() => window.print()}>
                Print Receipt
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {printInvoice && selected ? (
        <div className="modal-backdrop invoice-print-backdrop">
          <style>{`@media print { @page { size: ${taxProfile?.invoicePaperSize || "A4"}; margin: 10mm; } }`}</style>
          <section
            className={`module-modal invoice-print-modal paper-${(taxProfile?.invoicePaperSize || "A4").toLowerCase()}`}
            style={
              { "--invoice-accent": taxProfile?.invoiceAccentColor || "#173958" } as CSSProperties
            }
            role="dialog"
            aria-modal="true"
          >
            <header className="modal-header no-print">
              <div>
                <span className="heading-kicker">Customer Invoice</span>
                <h2>{selected.invoiceNumber}</h2>
              </div>
              <button type="button" onClick={() => setPrintInvoice(false)}>
                ×
              </button>
            </header>
            <div className="invoice-sheet">
              <header>
                <div>
                  {taxProfile?.invoiceLogoUrl ? (
                    <img
                      className="invoice-logo"
                      src={taxProfile.invoiceLogoUrl}
                      alt="Business logo"
                    />
                  ) : null}
                  <strong>
                    {taxProfile?.legalName || activeCompany?.name || "Digital Viyabari"}
                  </strong>
                  <span>{taxProfile?.tradeName || activeBranch?.name}</span>
                  {taxProfile ? (
                    <small>
                      {[taxProfile.addressLine1, taxProfile.addressLine2, taxProfile.city]
                        .filter(Boolean)
                        .join(", ")}
                      {taxProfile.postalCode ? ` - ${taxProfile.postalCode}` : ""}
                    </small>
                  ) : null}
                  {taxProfile?.gstRegistered && taxProfile.gstin ? (
                    <small>GSTIN: {taxProfile.gstin}</small>
                  ) : null}
                </div>
                <div>
                  <b>TAX INVOICE</b>
                  <span>{selected.invoiceNumber}</span>
                  <small>{shownDate(selected.issuedAt)}</small>
                </div>
              </header>
              <section className="invoice-customer">
                <div>
                  <span>Customer</span>
                  <strong>{selected.customerName}</strong>
                  {selectedCustomer?.gstin ? <small>GSTIN: {selectedCustomer.gstin}</small> : null}
                  {selectedCustomer?.address ? <small>{selectedCustomer.address}</small> : null}
                </div>
                <div>
                  <span>Vehicle</span>
                  <strong>{selected.registrationNumber}</strong>
                  <small>{selected.vehicleLabel}</small>
                </div>
              </section>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>GST</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoiceLines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.description}</td>
                      <td>
                        {line.quantity} {line.unit}
                      </td>
                      <td>{money.format(line.unitPrice)}</td>
                      <td>{line.gstRate}%</td>
                      <td>{money.format(line.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <section className="invoice-sheet-totals">
                <span>
                  Taxable <strong>{money.format(selected.taxableAmount)}</strong>
                </span>
                <span>
                  GST <strong>{money.format(selected.taxAmount)}</strong>
                </span>
                <b>
                  Total <strong>{money.format(selected.totalAmount)}</strong>
                </b>
                <span>
                  Paid <strong>{money.format(selected.paidAmount)}</strong>
                </span>
                <span>
                  Balance <strong>{money.format(selected.balanceAmount)}</strong>
                </span>
              </section>
              {taxProfile &&
              (taxProfile.upiId || taxProfile.bankName || taxProfile.accountNumber) ? (
                <section className="invoice-payment-details">
                  <strong>Payment Details</strong>
                  {taxProfile.upiId ? <span>UPI: {taxProfile.upiId}</span> : null}
                  {taxProfile.bankName ? <span>Bank: {taxProfile.bankName}</span> : null}
                  {taxProfile.accountName ? <span>Name: {taxProfile.accountName}</span> : null}
                  {taxProfile.accountNumber ? (
                    <span>Account: {taxProfile.accountNumber}</span>
                  ) : null}
                  {taxProfile.ifscCode ? <span>IFSC: {taxProfile.ifscCode}</span> : null}
                </section>
              ) : null}
              {selected.notes ? <p>{selected.notes}</p> : null}
              {taxProfile?.invoiceTerms ? (
                <p className="invoice-terms">Terms: {taxProfile.invoiceTerms}</p>
              ) : null}
            </div>
            <footer className="modal-footer no-print">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setPrintInvoice(false)}
              >
                Close
              </button>
              <button type="button" className="dv-button" onClick={() => window.print()}>
                Print / Save PDF
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
