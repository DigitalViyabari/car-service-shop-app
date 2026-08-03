"use client";

import type {
  BusinessTaxProfile,
  Customer,
  InventoryItem,
  Invoice,
  InvoiceLine,
  JobLineItem,
  JobSheet,
  Payment,
  PaymentMethod,
  Product,
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
type InvoiceDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "this_month"
  | "last_month"
  | "this_financial_year"
  | "previous_financial_year"
  | "custom";
type InvoicePaymentFilter = "all" | "paid" | "part_paid" | "unpaid";
type InvoiceBuilderLine = {
  id: string;
  type: "labour" | "product";
  productId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  gstRate: number;
};
function dateBounds(filter: InvoiceDateFilter, customFrom: string, customTo: string) {
  const now = new Date(),
    dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    nextDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
    financialYearStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  if (filter === "today") return { start: dayStart, end: nextDay(dayStart) };
  if (filter === "yesterday") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { start, end: dayStart };
  }
  if (filter === "this_month")
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  if (filter === "last_month")
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  if (filter === "this_financial_year")
    return {
      start: new Date(financialYearStart, 3, 1),
      end: new Date(financialYearStart + 1, 3, 1),
    };
  if (filter === "previous_financial_year")
    return {
      start: new Date(financialYearStart - 1, 3, 1),
      end: new Date(financialYearStart, 3, 1),
    };
  if (filter === "custom")
    return {
      start: customFrom ? new Date(`${customFrom}T00:00:00`) : null,
      end: customTo ? nextDay(new Date(`${customTo}T00:00:00`)) : null,
    };
  return { start: null, end: null };
}
function withinDates(value: unknown, bounds: { start: Date | null; end: Date | null }) {
  const date = paymentDate(value);
  if (Number.isNaN(date.getTime())) return false;
  return (!bounds.start || date >= bounds.start) && (!bounds.end || date < bounds.end);
}

export default function InvoicesPage() {
  const { user, memberships, activeCompany, activeCompanyId, activeBranchId, activeBranch } =
    useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]),
    [jobs, setJobs] = useState<JobSheet[]>([]),
    [lines, setLines] = useState<JobLineItem[]>([]),
    [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [taxProfile, setTaxProfile] = useState<BusinessTaxProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false),
    [invoiceMode, setInvoiceMode] = useState<"job" | "counter_sale">("job"),
    [jobId, setJobId] = useState(""),
    [counterCustomerId, setCounterCustomerId] = useState("walk-in"),
    [counterCustomerName, setCounterCustomerName] = useState("Walk-In Customer"),
    [builderLines, setBuilderLines] = useState<InvoiceBuilderLine[]>([]),
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
  const [dateFilter, setDateFilter] = useState<InvoiceDateFilter>("all"),
    [paymentFilter, setPaymentFilter] = useState<InvoicePaymentFilter>("all"),
    [invoiceTypeFilter, setInvoiceTypeFilter] = useState<"all" | "job" | "counter_sale">("all"),
    [customFrom, setCustomFrom] = useState(""),
    [customTo, setCustomTo] = useState("");
  const [financeView, setFinanceView] = useState<"invoices" | "pending">("invoices");
  const [showEdit, setShowEdit] = useState(false),
    [editDueAt, setEditDueAt] = useState(""),
    [editNotes, setEditNotes] = useState(""),
    [editLines, setEditLines] = useState<InvoiceBuilderLine[]>([]),
    [amendmentReason, setAmendmentReason] = useState("");
  const [editPayment, setEditPayment] = useState<Payment | null>(null),
    [correctionAmount, setCorrectionAmount] = useState(""),
    [correctionMethod, setCorrectionMethod] = useState<PaymentMethod>("upi"),
    [correctionReference, setCorrectionReference] = useState(""),
    [correctionNotes, setCorrectionNotes] = useState(""),
    [correctionReason, setCorrectionReason] = useState("");

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
        productDocs,
        inventoryDocs,
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
        getDocs(
          query(
            collection(firebaseClient.db, "products"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "inventoryItems"),
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
        invoiceLineDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as InvoiceLine)
          .filter(({ status }) => !status || status === "active"),
      );
      setPayments(paymentDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Payment));
      setCustomers(customerDocs.docs.map((item) => ({ ...item.data(), id: item.id }) as Customer));
      setProducts(
        productDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as Product)
          .filter(({ status }) => status === "active"),
      );
      setInventory(
        inventoryDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as InventoryItem)
          .filter(({ status }) => status === "active"),
      );
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
  const invoicedJob = jobs.find(({ id }) => id === selected?.jobId);
  const invoicedJobNumber = selected?.jobNumber || invoicedJob?.jobNumber || "—";
  const eligibleJobs = useMemo(
    () =>
      jobs.filter(
        (job) => job.status === "ready" && job.approvalStatus === "approved" && job.estimateLocked,
      ),
    [jobs],
  );
  const invoiceableJobs = useMemo(
    () => eligibleJobs.filter((job) => !invoices.some(({ jobId }) => jobId === job.id)),
    [eligibleJobs, invoices],
  );
  const selectedJob = jobs.find(({ id }) => id === jobId);
  const selectedPayments = payments
    .filter(({ invoiceId }) => invoiceId === selectedId)
    .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  const bounds = dateBounds(dateFilter, customFrom, customTo),
    filteredInvoices = invoices.filter((invoice) => {
      const paymentMatches =
        paymentFilter === "all" ||
        (paymentFilter === "paid" && invoice.balanceAmount <= 0) ||
        (paymentFilter === "part_paid" && invoice.paidAmount > 0 && invoice.balanceAmount > 0) ||
        (paymentFilter === "unpaid" && invoice.paidAmount <= 0 && invoice.balanceAmount > 0);
      const typeMatches =
        invoiceTypeFilter === "all" ||
        (invoiceTypeFilter === "counter_sale"
          ? invoice.sourceType === "counter_sale"
          : invoice.sourceType !== "counter_sale");
      return withinDates(invoice.issuedAt, bounds) && paymentMatches && typeMatches;
    }),
    filteredPayments = payments
      .filter(({ receivedAt, status }) => status === "completed" && withinDates(receivedAt, bounds))
      .sort((a, b) => paymentDate(b.receivedAt).getTime() - paymentDate(a.receivedAt).getTime()),
    pendingInvoices = invoices
      .filter(({ balanceAmount, status }) => balanceAmount > 0 && status !== "void")
      .sort((a, b) => Number(b.balanceAmount) - Number(a.balanceAmount)),
    collectedInPeriod = filteredPayments.reduce((sum, item) => sum + item.amount, 0);
  const totals = {
    billed: filteredInvoices.reduce((sum, item) => sum + item.totalAmount, 0),
    collected: filteredInvoices.reduce((sum, item) => sum + item.paidAmount, 0),
    due: filteredInvoices.reduce((sum, item) => sum + item.balanceAmount, 0),
    open: filteredInvoices.filter(
      ({ balanceAmount, status }) => balanceAmount > 0 && status !== "void",
    ).length,
  };
  useEffect(() => {
    if (filteredInvoices.some(({ id }) => id === selectedId)) return;
    setSelectedId(filteredInvoices[0]?.id ?? null);
  }, [filteredInvoices, selectedId]);

  function jobLinesForBuilder(selectedJobId: string) {
    return lines
      .filter(({ jobId: lineJobId }) => lineJobId === selectedJobId)
      .map((line) => ({
        id: line.id,
        type: line.type,
        productId: line.productId ?? "",
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        discount: line.discount,
        gstRate: line.gstRate,
      }));
  }

  function updateBuilderLine(id: string, values: Partial<InvoiceBuilderLine>) {
    setBuilderLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...values } : line)),
    );
  }

  function addLabourLine() {
    setBuilderLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: "labour",
        productId: "",
        description: "Labour / Service",
        quantity: 1,
        unit: "JOB",
        unitPrice: 0,
        discount: 0,
        gstRate: 18,
      },
    ]);
  }

  function addProductLine(productId: string) {
    const product = products.find(({ id }) => id === productId),
      stock = inventory.find((item) => item.productId === productId);
    if (!product) return;
    setBuilderLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: "product",
        productId,
        description: product.name,
        quantity: 1,
        unit: product.unit,
        unitPrice: stock?.sellingPrice ?? product.mrp ?? 0,
        discount: 0,
        gstRate: product.gstRate,
      },
    ]);
  }

  function updateEditLine(id: string, values: Partial<InvoiceBuilderLine>) {
    setEditLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...values } : line)),
    );
  }

  function addEditLabourLine() {
    setEditLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: "labour",
        productId: "",
        description: "Labour / Service",
        quantity: 1,
        unit: "JOB",
        unitPrice: 0,
        discount: 0,
        gstRate: 0,
      },
    ]);
  }

  function addEditProductLine(productId: string) {
    const product = products.find(({ id }) => id === productId),
      stock = inventory.find((item) => item.productId === productId);
    if (!product) return;
    setEditLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: "product",
        productId,
        description: product.name,
        quantity: 1,
        unit: product.unit,
        unitPrice: stock?.sellingPrice ?? product.mrp ?? 0,
        discount: 0,
        gstRate: product.gstRate,
      },
    ]);
  }

  const editTotals = editLines.reduce(
    (totals, line) => {
      const taxable = Math.max(0, line.quantity * line.unitPrice - line.discount),
        tax = (taxable * line.gstRate) / 100;
      return {
        taxable: totals.taxable + taxable,
        tax: totals.tax + tax,
        total: totals.total + taxable + tax,
      };
    },
    { taxable: 0, tax: 0, total: 0 },
  );

  const builderTotals = builderLines.reduce(
    (totals, line) => {
      const taxable = Math.max(0, line.quantity * line.unitPrice - line.discount),
        tax = (taxable * line.gstRate) / 100;
      return {
        taxable: totals.taxable + taxable,
        tax: totals.tax + tax,
        total: totals.total + taxable + tax,
      };
    },
    { taxable: 0, tax: 0, total: 0 },
  );

  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    if (
      !user ||
      !activeCompanyId ||
      !activeBranchId ||
      !builderLines.length ||
      (invoiceMode === "job" && !selectedJob)
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      const [token, appCheck] = await Promise.all([user.getIdToken(), getFirebaseAppCheckToken()]),
        response = await fetch("/api/v1/invoices/issue", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            "x-firebase-appcheck": appCheck,
          },
          body: JSON.stringify({
            companyId: activeCompanyId,
            branchId: activeBranchId,
            sourceType: invoiceMode,
            jobId: invoiceMode === "job" ? selectedJob?.id : undefined,
            customerId: invoiceMode === "counter_sale" ? counterCustomerId : undefined,
            customerName: invoiceMode === "counter_sale" ? counterCustomerName.trim() : undefined,
            dueAt: dueAt || null,
            notes: notes.trim(),
            lines: builderLines.map((line) => ({
              type: line.type,
              productId: line.productId || null,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              discount: line.discount,
              gstRate: line.gstRate,
            })),
          }),
        }),
        result = (await response.json()) as { invoiceId?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to issue invoice.");
      setShowCreate(false);
      setJobId("");
      setBuilderLines([]);
      setDueAt("");
      setNotes("");
      await load();
      setSelectedId(result.invoiceId ?? selectedJob?.id ?? null);
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

  async function editInvoice(event: FormEvent) {
    event.preventDefault();
    if (!user || !selected || !activeCompanyId || !activeBranchId || selected.status === "void")
      return;
    if (!editLines.length) {
      setError("Add at least one invoice item.");
      return;
    }
    if (amendmentReason.trim().length < 3) {
      setError("Enter why this issued invoice is being edited.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [idToken, appCheck] = await Promise.all([
          user.getIdToken(),
          getFirebaseAppCheckToken(),
        ]),
        response = await fetch("/api/v1/invoices/amend", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${idToken}`,
            "x-firebase-appcheck": appCheck,
          },
          body: JSON.stringify({
            companyId: activeCompanyId,
            branchId: activeBranchId,
            invoiceId: selected.id,
            reason: amendmentReason.trim(),
            dueAt: editDueAt || null,
            notes: editNotes.trim(),
            lines: editLines.map((line) => ({
              type: line.type,
              productId: line.productId || null,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              discount: line.discount,
              gstRate: line.gstRate,
            })),
          }),
        }),
        result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to edit invoice.");
      setShowEdit(false);
      setAmendmentReason("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to edit invoice.");
    } finally {
      setSubmitting(false);
    }
  }

  async function correctRecordedPayment(event: FormEvent) {
    event.preventDefault();
    if (!user || !editPayment || !activeCompanyId || !activeBranchId) return;
    const amount = Number(correctionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter the corrected amount received.");
      return;
    }
    if (correctionReason.trim().length < 3) {
      setError("Enter a correction reason for the audit record.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const [idToken, appCheck] = await Promise.all([
          user.getIdToken(),
          getFirebaseAppCheckToken(),
        ]),
        response = await fetch("/api/v1/payments/correct", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${idToken}`,
            "x-firebase-appcheck": appCheck,
          },
          body: JSON.stringify({
            companyId: activeCompanyId,
            branchId: activeBranchId,
            paymentId: editPayment.id,
            amount,
            method: correctionMethod,
            reference: correctionReference.trim(),
            notes: correctionNotes.trim(),
            reason: correctionReason.trim(),
          }),
        }),
        result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to correct payment.");
      setEditPayment(null);
      setCorrectionAmount("");
      setCorrectionReference("");
      setCorrectionNotes("");
      setCorrectionReason("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to correct payment.");
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
          onClick={() => {
            setError(null);
            setShowCreate(true);
            setInvoiceMode("job");
            const firstJobId = invoiceableJobs[0]?.id ?? "";
            setJobId(firstJobId);
            setBuilderLines(jobLinesForBuilder(firstJobId));
            setCounterCustomerId("walk-in");
            setCounterCustomerName("Walk-In Customer");
          }}
        >
          <strong>+</strong> New Invoice
        </button>
      </div>
      {error && !showCreate && !showPayment && !showEdit && !editPayment ? (
        <div className="alert alert--error module-alert">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      ) : null}
      <nav className="finance-view-tabs" aria-label="Invoice views">
        <button
          type="button"
          className={financeView === "invoices" ? "is-active" : ""}
          onClick={() => setFinanceView("invoices")}
        >
          All Invoices
        </button>
        <button
          type="button"
          className={financeView === "pending" ? "is-active" : ""}
          onClick={() => setFinanceView("pending")}
        >
          Pending Payments <span>{pendingInvoices.length}</span>
        </button>
      </nav>
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
      <section className="invoice-filters" aria-label="Invoice filters">
        <label>
          Invoice Period
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as InvoiceDateFilter)}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_financial_year">This Financial Year</option>
            <option value="previous_financial_year">Previous Financial Year</option>
            <option value="custom">Custom Date</option>
          </select>
        </label>
        <label>
          Invoice Type
          <select
            value={invoiceTypeFilter}
            onChange={(event) =>
              setInvoiceTypeFilter(event.target.value as "all" | "job" | "counter_sale")
            }
          >
            <option value="all">All Invoices</option>
            <option value="job">Job Invoices</option>
            <option value="counter_sale">Counter Sales</option>
          </select>
        </label>
        <label>
          Payment Status
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value as InvoicePaymentFilter)}
          >
            <option value="all">All Payments</option>
            <option value="paid">Fully Paid</option>
            <option value="part_paid">Partially Paid</option>
            <option value="unpaid">Not Paid</option>
          </select>
        </label>
        {dateFilter === "custom" ? (
          <>
            <label>
              From Date
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label>
              To Date
              <input
                type="date"
                min={customFrom || undefined}
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
          </>
        ) : null}
        <div className="invoice-filter-result">
          <strong>{filteredInvoices.length}</strong>
          <span>Invoices Found</span>
        </div>
      </section>
      <section className="invoice-summary">
        <div className="finance-blue">
          <span>Invoiced</span>
          <strong>{money.format(totals.billed)}</strong>
        </div>
        <div className="finance-green">
          <span>Payments In Period</span>
          <strong>{money.format(collectedInPeriod)}</strong>
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
      <section className="pending-payment-panel" hidden={financeView !== "pending"}>
        <header>
          <div>
            <span className="heading-kicker">Customer Follow-Up</span>
            <h2>Pending Payments</h2>
          </div>
          <strong>
            {money.format(pendingInvoices.reduce((sum, item) => sum + item.balanceAmount, 0))}
          </strong>
        </header>
        {pendingInvoices.length === 0 ? (
          <div className="list-state list-state--empty">
            <strong>No Pending Payments</strong>
            <p>All issued invoices are settled.</p>
          </div>
        ) : (
          <div className="pending-payment-list">
            {pendingInvoices.map((invoice) => {
              const customer = customers.find(({ id }) => id === invoice.customerId);
              return (
                <button
                  type="button"
                  key={invoice.id}
                  onClick={() => {
                    setSelectedId(invoice.id);
                    setDateFilter("all");
                    setPaymentFilter("all");
                    setFinanceView("invoices");
                  }}
                >
                  <span>
                    <strong>{invoice.customerName}</strong>
                    <small>{customer?.phone || "Phone Not Recorded"}</small>
                  </span>
                  <span>
                    <strong>
                      {invoice.sourceType === "counter_sale"
                        ? "Counter Sale"
                        : invoice.jobNumber || "Job Sheet"}
                    </strong>
                    <small>{invoice.invoiceNumber}</small>
                  </span>
                  <span>
                    <small>Invoice Total</small>
                    <strong>{money.format(invoice.totalAmount)}</strong>
                  </span>
                  <span>
                    <small>Paid</small>
                    <strong>{money.format(invoice.paidAmount)}</strong>
                  </span>
                  <span className="pending-balance">
                    <small>Pending</small>
                    <strong>{money.format(invoice.balanceAmount)}</strong>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <section className="invoice-workspace" hidden={financeView !== "invoices"}>
        <div className="invoice-directory">
          <div className="invoice-directory-head">
            <strong>Branch Invoices</strong>
            <span>{filteredInvoices.length}</span>
          </div>
          {loading ? (
            <div className="list-state">
              <span className="spinner" />
              Loading Invoices…
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="list-state list-state--empty">
              <strong>{invoices.length ? "No Matching Invoices" : "No Invoices Yet"}</strong>
              <p>
                {invoices.length
                  ? "Change the period or payment filter."
                  : "Approve an estimate, then issue its invoice."}
              </p>
            </div>
          ) : (
            filteredInvoices.map((invoice) => (
              <button
                key={invoice.id}
                className={`invoice-row ${selectedId === invoice.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(invoice.id)}
              >
                <span>
                  <strong>{invoice.invoiceNumber}</strong>
                  <small>
                    {invoice.customerName} ·{" "}
                    {invoice.sourceType === "counter_sale"
                      ? "Counter Sale"
                      : invoice.registrationNumber}
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
                    {selected.sourceType === "counter_sale"
                      ? "Direct Product Sale"
                      : `${selected.registrationNumber} · ${selected.vehicleLabel}`}
                  </p>
                </div>
                <div className="invoice-head-actions">
                  <span className={`invoice-status invoice-status-${selected.status}`}>
                    {selected.status.replace("_", " ")}
                  </span>
                  <button type="button" onClick={() => setPrintInvoice(true)}>
                    Print Invoice
                  </button>
                  <button
                    type="button"
                    disabled={selected.status === "void"}
                    onClick={() => {
                      setEditDueAt(
                        selected.dueAt
                          ? paymentDate(selected.dueAt).toLocaleDateString("en-CA")
                          : "",
                      );
                      setEditNotes(selected.notes ?? "");
                      setEditLines(
                        selectedInvoiceLines.map((line) => ({
                          id: line.id,
                          type: line.type,
                          productId: line.productId ?? "",
                          description: line.description,
                          quantity: line.quantity,
                          unit: line.unit,
                          unitPrice: line.unitPrice,
                          discount: line.discount,
                          gstRate: line.gstRate,
                        })),
                      );
                      setAmendmentReason("");
                      setError(null);
                      setShowEdit(true);
                    }}
                  >
                    Edit Invoice
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
                    setPaymentAmount("");
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
                        {payment.status === "completed" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditPayment(payment);
                              setCorrectionAmount(String(payment.amount));
                              setCorrectionMethod(payment.method);
                              setCorrectionReference(payment.reference ?? "");
                              setCorrectionNotes(payment.notes ?? "");
                              setCorrectionReason("");
                              setError(null);
                            }}
                          >
                            Correct Payment
                          </button>
                        ) : null}
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
      <section className="collection-register" hidden={financeView !== "invoices"}>
        <header>
          <div>
            <span className="heading-kicker">Payment Register</span>
            <h2>Who Paid</h2>
          </div>
          <strong>{money.format(collectedInPeriod)}</strong>
        </header>
        {filteredPayments.length === 0 ? (
          <div className="list-state list-state--empty">
            <strong>No Payments In This Period</strong>
            <p>Completed customer payments will appear here.</p>
          </div>
        ) : (
          <div className="collection-list">
            {filteredPayments.map((payment) => {
              const invoice = invoices.find(({ id }) => id === payment.invoiceId);
              return (
                <button
                  type="button"
                  key={payment.id}
                  onClick={() => {
                    if (!invoice) return;
                    setDateFilter("all");
                    setPaymentFilter("all");
                    setSelectedId(invoice.id);
                  }}
                >
                  <span>
                    <strong>{invoice?.customerName ?? "Customer"}</strong>
                    <small>
                      {invoice?.invoiceNumber ?? payment.receiptNumber} ·{" "}
                      {invoice?.registrationNumber ?? "—"}
                    </small>
                  </span>
                  <span>
                    <strong>{money.format(payment.amount)}</strong>
                    <small>
                      {methods.find(([value]) => value === payment.method)?.[1]} ·{" "}
                      {shownDate(payment.receivedAt)}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      {showEdit && selected ? (
        <div className="modal-backdrop">
          <form className="module-modal invoice-builder-modal" onSubmit={editInvoice}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">{selected.invoiceNumber}</span>
                <h2>Edit Issued Invoice</h2>
              </div>
              <button type="button" onClick={() => setShowEdit(false)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="modal-body invoice-builder-body">
              <p className="invoice-final-warning">
                The invoice number stays the same. Every edit is saved as a numbered amendment for
                your audit history.
              </p>
              <div className="invoice-builder-tools">
                <button type="button" onClick={addEditLabourLine}>
                  + Labour / Service
                </button>
                <label>
                  <span>Add Product</span>
                  <select value="" onChange={(event) => addEditProductLine(event.target.value)}>
                    <option value="">Select Product / SKU / Barcode</option>
                    {products.map((product) => {
                      const stock = inventory.find((item) => item.productId === product.id);
                      return (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.sku} · Stock {stock?.currentStock ?? 0}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              <div className="invoice-builder-lines">
                {editLines.map((line) => (
                  <article key={line.id}>
                    <label className="invoice-line-description">
                      Description
                      <input
                        value={line.description}
                        onChange={(event) =>
                          updateEditLine(line.id, { description: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label>
                      Qty
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(event) =>
                          updateEditLine(line.id, { quantity: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Unit Price
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) =>
                          updateEditLine(line.id, { unitPrice: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Discount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.discount}
                        onChange={(event) =>
                          updateEditLine(line.id, { discount: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      GST
                      <select
                        value={line.gstRate}
                        onChange={(event) =>
                          updateEditLine(line.id, { gstRate: Number(event.target.value) })
                        }
                      >
                        {[0, 5, 12, 18, 28, 40].map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%
                          </option>
                        ))}
                      </select>
                    </label>
                    <strong>
                      {money.format(
                        Math.max(0, line.quantity * line.unitPrice - line.discount) *
                          (1 + line.gstRate / 100),
                      )}
                    </strong>
                    <button
                      type="button"
                      aria-label={`Remove ${line.description}`}
                      onClick={() =>
                        setEditLines((current) => current.filter(({ id }) => id !== line.id))
                      }
                    >
                      ×
                    </button>
                  </article>
                ))}
              </div>
              <div className="invoice-builder-meta">
                <label>
                  Payment Due Date (Credit Sales Only)
                  <input
                    type="date"
                    value={editDueAt}
                    onChange={(event) => setEditDueAt(event.target.value)}
                  />
                  <small>Leave empty for immediate or cash payment.</small>
                </label>
                <label>
                  Invoice Notes
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(event) => setEditNotes(event.target.value)}
                    placeholder="Warranty, payment or delivery notes"
                  />
                </label>
              </div>
              <label>
                Reason For Edit *
                <input
                  value={amendmentReason}
                  onChange={(event) => setAmendmentReason(event.target.value)}
                  placeholder="Example: Customer added an accessory"
                  required
                />
              </label>
              <div className="invoice-preview">
                <span>
                  Items <strong>{editLines.length}</strong>
                </span>
                <span>
                  Taxable <strong>{money.format(editTotals.taxable)}</strong>
                </span>
                <span>
                  GST <strong>{money.format(editTotals.tax)}</strong>
                </span>
                <span>
                  Revised Total <strong>{money.format(editTotals.total)}</strong>
                </span>
                <span>
                  Already Paid <strong>{money.format(selected.paidAmount)}</strong>
                </span>
              </div>
              {editTotals.total < selected.paidAmount ? (
                <p className="invoice-final-warning">
                  This creates a customer credit of{" "}
                  {money.format(selected.paidAmount - editTotals.total)}.
                </p>
              ) : null}
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setShowEdit(false)}>
                Cancel
              </button>
              <button className="dv-button" disabled={submitting}>
                {submitting ? "Saving Amendment…" : "Save Invoice Amendment"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showCreate ? (
        <div className="modal-backdrop">
          <form className="module-modal invoice-builder-modal" onSubmit={createInvoice}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">Draft — Not A Tax Invoice</span>
                <h2>Invoice Builder</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="modal-body invoice-builder-body">
              <div className="invoice-source-tabs">
                <button
                  type="button"
                  className={invoiceMode === "job" ? "is-active" : ""}
                  onClick={() => {
                    setInvoiceMode("job");
                    const firstJobId = invoiceableJobs[0]?.id ?? "";
                    setJobId(firstJobId);
                    setBuilderLines(jobLinesForBuilder(firstJobId));
                  }}
                >
                  Job Invoice
                </button>
                <button
                  type="button"
                  className={invoiceMode === "counter_sale" ? "is-active" : ""}
                  onClick={() => {
                    setInvoiceMode("counter_sale");
                    setJobId("");
                    setBuilderLines([]);
                  }}
                >
                  Counter Sale
                </button>
              </div>
              {invoiceMode === "job" ? (
                <label>
                  Ready Job
                  <select
                    value={jobId}
                    onChange={(event) => {
                      setJobId(event.target.value);
                      setBuilderLines(jobLinesForBuilder(event.target.value));
                    }}
                    required
                  >
                    {invoiceableJobs.length === 0 ? <option value="">No Ready Job</option> : null}
                    {invoiceableJobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.jobNumber} · {job.customerName} · {job.registrationNumber}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="invoice-customer-grid">
                  <label>
                    Customer
                    <select
                      value={counterCustomerId}
                      onChange={(event) => {
                        const customer = customers.find(({ id }) => id === event.target.value);
                        setCounterCustomerId(event.target.value);
                        setCounterCustomerName(customer?.name ?? "Walk-In Customer");
                      }}
                    >
                      <option value="walk-in">Walk-In Customer</option>
                      {customers
                        .filter(({ status }) => status === "active")
                        .map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} · {customer.phone}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Invoice Name
                    <input
                      value={counterCustomerName}
                      onChange={(event) => setCounterCustomerName(event.target.value)}
                      required
                    />
                  </label>
                </div>
              )}
              <div className="invoice-builder-tools">
                <button type="button" onClick={addLabourLine}>
                  + Labour
                </button>
                <label>
                  <span>Add Product</span>
                  <select value="" onChange={(event) => addProductLine(event.target.value)}>
                    <option value="">Select Product / SKU / Barcode</option>
                    {products.map((product) => {
                      const stock = inventory.find((item) => item.productId === product.id);
                      return (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.sku} · Stock {stock?.currentStock ?? 0}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              <div className="invoice-builder-lines">
                {builderLines.length === 0 ? (
                  <div className="invoice-edit-note">Add at least one labour or product item.</div>
                ) : (
                  builderLines.map((line) => (
                    <article key={line.id}>
                      <label className="invoice-line-description">
                        Description
                        <input
                          value={line.description}
                          onChange={(event) =>
                            updateBuilderLine(line.id, { description: event.target.value })
                          }
                          required
                        />
                      </label>
                      <label>
                        Qty
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) =>
                            updateBuilderLine(line.id, { quantity: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Unit Price
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateBuilderLine(line.id, { unitPrice: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Discount
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.discount}
                          onChange={(event) =>
                            updateBuilderLine(line.id, { discount: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label>
                        GST
                        <select
                          value={line.gstRate}
                          onChange={(event) =>
                            updateBuilderLine(line.id, { gstRate: Number(event.target.value) })
                          }
                        >
                          {[0, 5, 12, 18, 28, 40].map((rate) => (
                            <option key={rate} value={rate}>
                              {rate}%
                            </option>
                          ))}
                        </select>
                      </label>
                      <strong>
                        {money.format(
                          Math.max(0, line.quantity * line.unitPrice - line.discount) *
                            (1 + line.gstRate / 100),
                        )}
                      </strong>
                      <button
                        type="button"
                        aria-label={`Remove ${line.description}`}
                        onClick={() =>
                          setBuilderLines((current) => current.filter(({ id }) => id !== line.id))
                        }
                      >
                        ×
                      </button>
                    </article>
                  ))
                )}
              </div>
              <div className="invoice-builder-meta">
                <label>
                  Payment Due Date (Credit Sales Only)
                  <input
                    type="date"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                  />
                  <small>Leave empty for immediate or cash payment.</small>
                </label>
                <label>
                  Invoice Notes
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
              <div className="invoice-preview">
                <span>
                  Items <strong>{builderLines.length}</strong>
                </span>
                {invoiceMode === "job" && selectedJob ? (
                  <span>
                    Estimate <strong>{money.format(selectedJob.estimateTotal)}</strong>
                  </span>
                ) : null}
                <span>
                  Taxable <strong>{money.format(builderTotals.taxable)}</strong>
                </span>
                <span>
                  GST <strong>{money.format(builderTotals.tax)}</strong>
                </span>
                <span>
                  Final Total <strong>{money.format(builderTotals.total)}</strong>
                </span>
              </div>
              <p className="invoice-final-warning">
                Confirm carefully. The official GST invoice number is generated only now, and issued
                items and values will be locked.
              </p>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="dv-button"
                disabled={
                  submitting ||
                  builderLines.length === 0 ||
                  (invoiceMode === "job" && !jobId) ||
                  (invoiceMode === "counter_sale" && counterCustomerName.trim().length < 2)
                }
              >
                {submitting ? "Issuing…" : "Confirm & Issue Final Invoice"}
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
                  placeholder={`Up to ${money.format(selected.balanceAmount)}`}
                  autoFocus
                  required
                />
                <small>
                  Enter only the amount received now. Balance:{" "}
                  {money.format(selected.balanceAmount)}
                </small>
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
              {Number(paymentAmount) > 0 ? (
                <div
                  className={`span-2 payment-entry-summary ${Number(paymentAmount) < selected.balanceAmount ? "is-partial" : "is-full"}`}
                >
                  <strong>
                    {Number(paymentAmount) < selected.balanceAmount
                      ? "Partial Payment"
                      : "Full Payment"}
                  </strong>
                  <span>
                    Received {money.format(Number(paymentAmount))} · Remaining{" "}
                    {money.format(Math.max(0, selected.balanceAmount - Number(paymentAmount)))}
                  </span>
                </div>
              ) : null}
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
      {editPayment && selected ? (
        <div className="modal-backdrop">
          <form className="module-modal payment-modal" onSubmit={correctRecordedPayment}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">{editPayment.receiptNumber}</span>
                <h2>Correct Received Payment</h2>
              </div>
              <button type="button" onClick={() => setEditPayment(null)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="modal-body form-grid">
              <label>
                Correct Amount Received
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={correctionAmount}
                  onChange={(event) => setCorrectionAmount(event.target.value)}
                  required
                />
              </label>
              <label>
                Payment Method
                <select
                  value={correctionMethod}
                  onChange={(event) => setCorrectionMethod(event.target.value as PaymentMethod)}
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
                  value={correctionReference}
                  onChange={(event) => setCorrectionReference(event.target.value)}
                />
              </label>
              <label className="span-2">
                Payment Notes
                <textarea
                  rows={2}
                  value={correctionNotes}
                  onChange={(event) => setCorrectionNotes(event.target.value)}
                />
              </label>
              <label className="span-2">
                Correction Reason
                <input
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder="Example: Typing mistake in received amount"
                  required
                />
              </label>
              <p className="span-2 invoice-edit-note">
                The previous value and correction reason are preserved in the audit history. The
                invoice paid amount and balance will be recalculated automatically.
              </p>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={() => setEditPayment(null)}>
                Cancel
              </button>
              <button className="dv-button" disabled={submitting}>
                {submitting ? "Correcting…" : "Save Payment Correction"}
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
                  <small>Job Card: {invoicedJobNumber}</small>
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
