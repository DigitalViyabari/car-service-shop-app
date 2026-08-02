"use client";

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";

type Supplier = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  gstin: string;
  address?: string;
  status: string;
};
type Product = { id: string; name: string; sku: string; gstRate: number };
type Inventory = { id: string; productId: string; currentStock: number; purchasePrice: number };
type Purchase = {
  id: string;
  supplierName: string;
  billNumber: string;
  billDate: string;
  totalAmount: number;
  paymentStatus: string;
};
type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
};
type Line = { productId: string; quantity: string; unitCost: string; gstRate: string };

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const today = () => new Date().toLocaleDateString("en-CA");
const emptyLine = (): Line => ({ productId: "", quantity: "1", unitCost: "", gstRate: "18" });
const expenseCategories = [
  "Rent",
  "Salary",
  "Electricity",
  "Water",
  "Tools",
  "Transport",
  "Marketing",
  "Maintenance",
  "Office",
  "Other",
];

export default function ProcurementPage() {
  const { user, memberships, activeCompanyId, activeBranchId } = useAuth();
  const membership = memberships.find(({ companyId }) => companyId === activeCompanyId);
  const companyRoles = membership?.companyRoles ?? [];
  const branchRoles =
    membership?.branchAssignments.find(({ branchId }) => branchId === activeBranchId)?.roles ?? [];
  const canInventory =
    companyRoles.some((role) => role === "company_owner" || role === "company_admin") ||
    branchRoles.some((role) => role === "branch_manager" || role === "inventory_manager");
  const canFinance =
    companyRoles.some((role) =>
      ["company_owner", "company_admin", "company_accountant"].includes(role),
    ) || branchRoles.some((role) => role === "branch_manager" || role === "finance_manager");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<"supplier" | "purchase" | "expense" | null>(null);
  const [saving, setSaving] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState({
    name: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
  });
  const [purchaseDraft, setPurchaseDraft] = useState({
    supplierId: "",
    billNumber: "",
    billDate: today(),
    paymentStatus: "unpaid",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [expenseDraft, setExpenseDraft] = useState({
    category: "Other",
    description: "",
    amount: "",
    expenseDate: today(),
    paymentMethod: "upi",
    reference: "",
  });

  const load = useCallback(async () => {
    if (!activeCompanyId || !activeBranchId || (!canInventory && !canFinance)) return;
    setLoading(true);
    setError(null);
    try {
      const scoped = (name: string) =>
        query(
          collection(firebaseClient.db, name),
          where("companyId", "==", activeCompanyId),
          where("branchId", "==", activeBranchId),
        );
      const [supplierDocs, productDocs, inventoryDocs, purchaseDocs, expenseDocs] =
        await Promise.all([
          getDocs(scoped("suppliers")),
          getDocs(
            query(
              collection(firebaseClient.db, "products"),
              where("companyId", "==", activeCompanyId),
            ),
          ),
          getDocs(scoped("inventoryItems")),
          getDocs(scoped("purchaseBills")),
          canFinance ? getDocs(scoped("expenses")) : Promise.resolve(null),
        ]);
      setSuppliers(
        supplierDocs.docs
          .map((item) => ({ id: item.id, ...item.data() }) as Supplier)
          .filter(({ status }) => status === "active")
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setProducts(
        productDocs.docs
          .map((item) => ({ id: item.id, ...item.data() }) as Product)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setInventory(
        inventoryDocs.docs.map((item) => ({ id: item.id, ...item.data() }) as Inventory),
      );
      setPurchases(
        purchaseDocs.docs
          .map((item) => ({ id: item.id, ...item.data() }) as Purchase)
          .sort((a, b) => b.billDate.localeCompare(a.billDate)),
      );
      setExpenses(
        expenseDocs
          ? expenseDocs.docs
              .map((item) => ({ id: item.id, ...item.data() }) as Expense)
              .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
          : [],
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load purchases and expenses.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId, canFinance, canInventory]);

  useEffect(() => void load(), [load]);

  const purchaseTotals = useMemo(
    () =>
      lines.reduce(
        (total, line) => {
          const taxable = Number(line.quantity || 0) * Number(line.unitCost || 0);
          const tax = (taxable * Number(line.gstRate || 0)) / 100;
          return {
            taxable: total.taxable + taxable,
            tax: total.tax + tax,
            grand: total.grand + taxable + tax,
          };
        },
        { taxable: 0, tax: 0, grand: 0 },
      ),
    [lines],
  );
  const totalPurchases = purchases.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const unpaidPurchases = purchases
    .filter(({ paymentStatus }) => paymentStatus !== "paid")
    .reduce((sum, item) => sum + item.totalAmount, 0);

  async function saveSupplier(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId || !canInventory) return;
    setSaving(true);
    setError(null);
    try {
      const reference = doc(collection(firebaseClient.db, "suppliers"));
      await runTransaction(firebaseClient.db, async (transaction) => {
        transaction.set(reference, {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          name: supplierDraft.name.trim(),
          phone: supplierDraft.phone.replace(/\D/g, ""),
          email: supplierDraft.email.trim().toLowerCase(),
          gstin: supplierDraft.gstin.trim().toUpperCase(),
          address: supplierDraft.address.trim(),
          status: "active",
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      });
      setSupplierDraft({ name: "", phone: "", email: "", gstin: "", address: "" });
      setModal(null);
      setNotice("Supplier added.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save supplier.");
    } finally {
      setSaving(false);
    }
  }

  async function savePurchase(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId || !canInventory) return;
    const supplier = suppliers.find(({ id }) => id === purchaseDraft.supplierId);
    const validLines = lines.filter(
      ({ productId, quantity, unitCost }) =>
        productId && Number(quantity) > 0 && Number(unitCost) >= 0,
    );
    if (!supplier || !purchaseDraft.billNumber.trim() || !validLines.length) {
      setError("Select a supplier, enter the bill number and add at least one valid item.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const purchaseRef = doc(collection(firebaseClient.db, "purchaseBills"));
      await runTransaction(firebaseClient.db, async (transaction) => {
        const stockEntries = await Promise.all(
          validLines.map(async (line) => {
            const product = products.find(({ id }) => id === line.productId)!;
            const existing = inventory.find(({ productId }) => productId === line.productId);
            const inventoryRef = existing
              ? doc(firebaseClient.db, "inventoryItems", existing.id)
              : doc(collection(firebaseClient.db, "inventoryItems"));
            const snapshot = existing ? await transaction.get(inventoryRef) : null;
            return { line, product, inventoryRef, existing, snapshot };
          }),
        );
        transaction.set(purchaseRef, {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          supplierId: supplier.id,
          supplierName: supplier.name,
          billNumber: purchaseDraft.billNumber.trim().toUpperCase(),
          billDate: purchaseDraft.billDate,
          taxableAmount: purchaseTotals.taxable,
          taxAmount: purchaseTotals.tax,
          totalAmount: purchaseTotals.grand,
          paymentStatus: purchaseDraft.paymentStatus,
          notes: purchaseDraft.notes.trim(),
          status: "posted",
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        for (const entry of stockEntries) {
          const quantity = Number(entry.line.quantity),
            unitCost = Number(entry.line.unitCost),
            gstRate = Number(entry.line.gstRate),
            taxableAmount = quantity * unitCost,
            taxAmount = (taxableAmount * gstRate) / 100,
            before = Number(
              entry.snapshot?.get("currentStock") ?? entry.existing?.currentStock ?? 0,
            ),
            after = before + quantity;
          const lineRef = doc(collection(firebaseClient.db, "purchaseLines"));
          transaction.set(lineRef, {
            companyId: activeCompanyId,
            branchId: activeBranchId,
            purchaseId: purchaseRef.id,
            productId: entry.product.id,
            productName: entry.product.name,
            quantity,
            unitCost,
            gstRate,
            taxableAmount,
            taxAmount,
            totalAmount: taxableAmount + taxAmount,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
          if (entry.existing) {
            transaction.update(entry.inventoryRef, {
              currentStock: after,
              purchasePrice: unitCost,
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            });
          } else {
            transaction.set(entry.inventoryRef, {
              companyId: activeCompanyId,
              branchId: activeBranchId,
              productId: entry.product.id,
              purchasePrice: unitCost,
              sellingPrice: 0,
              currentStock: after,
              reservedStock: 0,
              reorderLevel: 0,
              rackLocation: "",
              preferredSupplier: supplier.name,
              status: "active",
              createdAt: serverTimestamp(),
              createdBy: user.uid,
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            });
          }
          transaction.set(doc(collection(firebaseClient.db, "inventoryMovements")), {
            companyId: activeCompanyId,
            branchId: activeBranchId,
            productId: entry.product.id,
            inventoryItemId: entry.inventoryRef.id,
            type: "purchase",
            quantity,
            stockBefore: before,
            stockAfter: after,
            unitCost,
            supplierName: supplier.name,
            referenceNumber: purchaseDraft.billNumber.trim().toUpperCase(),
            notes: `Purchase ${purchaseRef.id}`,
            occurredAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }
      });
      setPurchaseDraft({
        supplierId: "",
        billNumber: "",
        billDate: today(),
        paymentStatus: "unpaid",
        notes: "",
      });
      setLines([emptyLine()]);
      setModal(null);
      setNotice("Purchase posted and stock updated.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to post purchase.");
    } finally {
      setSaving(false);
    }
  }

  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId || !canFinance) return;
    setSaving(true);
    setError(null);
    try {
      const reference = doc(collection(firebaseClient.db, "expenses"));
      await runTransaction(firebaseClient.db, async (transaction) => {
        transaction.set(reference, {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          category: expenseDraft.category,
          description: expenseDraft.description.trim(),
          amount: Number(expenseDraft.amount),
          expenseDate: expenseDraft.expenseDate,
          paymentMethod: expenseDraft.paymentMethod,
          reference: expenseDraft.reference.trim(),
          status: "recorded",
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      });
      setExpenseDraft({
        category: "Other",
        description: "",
        amount: "",
        expenseDate: today(),
        paymentMethod: "upi",
        reference: "",
      });
      setModal(null);
      setNotice("Expense recorded.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record expense.");
    } finally {
      setSaving(false);
    }
  }

  if (!canInventory && !canFinance)
    return (
      <main className="content">
        <div className="alert">This module is not assigned to your role.</div>
      </main>
    );

  return (
    <main className="content procurement-page">
      <header className="page-header compact-header">
        <div>
          <span className="heading-kicker">Money Out</span>
          <h1>Purchases &amp; Expenses</h1>
          <p>Stock bills, suppliers and daily costs.</p>
        </div>
        <div className="page-actions">
          {canInventory ? (
            <button className="cancel-button" onClick={() => setModal("supplier")}>
              Add Supplier
            </button>
          ) : null}
          {canInventory ? (
            <button className="dv-button secondary" onClick={() => setModal("purchase")}>
              New Purchase
            </button>
          ) : null}
          {canFinance ? (
            <button className="dv-button" onClick={() => setModal("expense")}>
              Add Expense
            </button>
          ) : null}
        </div>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      {notice ? <div className="success-banner">{notice}</div> : null}
      <section className="metric-grid procurement-metrics">
        <article>
          <span>Purchase Total</span>
          <strong>{money.format(totalPurchases)}</strong>
          <small>{purchases.length} Bills</small>
        </article>
        <article className="warning-card">
          <span>Supplier Due</span>
          <strong>{money.format(unpaidPurchases)}</strong>
          <small>Pending purchase bills</small>
        </article>
        {canFinance ? (
          <article className="danger-card">
            <span>Expenses</span>
            <strong>{money.format(totalExpenses)}</strong>
            <small>{expenses.length} Entries</small>
          </article>
        ) : null}
        <article className="positive-card">
          <span>Suppliers</span>
          <strong>{suppliers.length}</strong>
          <small>Active vendors</small>
        </article>
      </section>
      <section className="procurement-grid">
        <article className="data-card">
          <header>
            <div>
              <span className="heading-kicker">Purchase Register</span>
              <h2>Recent Bills</h2>
            </div>
          </header>
          {loading ? (
            <p className="muted">Loading bills…</p>
          ) : purchases.length ? (
            purchases.slice(0, 12).map((item) => (
              <div className="ledger-row" key={item.id}>
                <div>
                  <strong>{item.supplierName}</strong>
                  <small>
                    {item.billNumber} · {item.billDate}
                  </small>
                </div>
                <div>
                  <strong>{money.format(item.totalAmount)}</strong>
                  <span className={`mini-status ${item.paymentStatus}`}>
                    {item.paymentStatus.replaceAll("_", " ")}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-inline">
              <strong>No purchase bills</strong>
              <span>Add the first supplier bill to update stock.</span>
            </div>
          )}
        </article>
        {canFinance ? (
          <article className="data-card">
            <header>
              <div>
                <span className="heading-kicker">Expense Register</span>
                <h2>Recent Costs</h2>
              </div>
            </header>
            {loading ? (
              <p className="muted">Loading expenses…</p>
            ) : expenses.length ? (
              expenses.slice(0, 12).map((item) => (
                <div className="ledger-row" key={item.id}>
                  <div>
                    <strong>{item.description}</strong>
                    <small>
                      {item.category} · {item.expenseDate}
                    </small>
                  </div>
                  <div>
                    <strong>{money.format(item.amount)}</strong>
                    <span>{item.paymentMethod.toUpperCase()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-inline">
                <strong>No expenses recorded</strong>
                <span>Add rent, salary, utility or workshop costs.</span>
              </div>
            )}
          </article>
        ) : null}
      </section>

      {modal ? (
        <div className="modal-backdrop">
          <section className="module-modal procurement-modal" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <span className="heading-kicker">
                  {modal === "purchase" ? "Stock In" : modal === "expense" ? "Money Out" : "Vendor"}
                </span>
                <h2>
                  {modal === "purchase"
                    ? "New Purchase Bill"
                    : modal === "expense"
                      ? "Record Expense"
                      : "Add Supplier"}
                </h2>
              </div>
              <button onClick={() => setModal(null)} aria-label="Close">
                ×
              </button>
            </header>
            {modal === "supplier" ? (
              <form onSubmit={saveSupplier} className="form-grid">
                <label>
                  Supplier Name
                  <input
                    required
                    minLength={2}
                    value={supplierDraft.name}
                    onChange={(e) => setSupplierDraft({ ...supplierDraft, name: e.target.value })}
                  />
                </label>
                <label>
                  Phone
                  <input
                    inputMode="numeric"
                    value={supplierDraft.phone}
                    onChange={(e) => setSupplierDraft({ ...supplierDraft, phone: e.target.value })}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={supplierDraft.email}
                    onChange={(e) => setSupplierDraft({ ...supplierDraft, email: e.target.value })}
                  />
                </label>
                <label>
                  GSTIN
                  <input
                    maxLength={15}
                    value={supplierDraft.gstin}
                    onChange={(e) =>
                      setSupplierDraft({ ...supplierDraft, gstin: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label className="full">
                  Address
                  <textarea
                    value={supplierDraft.address}
                    onChange={(e) =>
                      setSupplierDraft({ ...supplierDraft, address: e.target.value })
                    }
                  />
                </label>
                <footer className="modal-footer full">
                  <button type="button" className="cancel-button" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button className="dv-button" disabled={saving}>
                    {saving ? "Saving…" : "Save Supplier"}
                  </button>
                </footer>
              </form>
            ) : null}
            {modal === "purchase" ? (
              <form onSubmit={savePurchase} className="purchase-form">
                <div className="form-grid">
                  <label>
                    Supplier
                    <select
                      required
                      value={purchaseDraft.supplierId}
                      onChange={(e) =>
                        setPurchaseDraft({ ...purchaseDraft, supplierId: e.target.value })
                      }
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Supplier Bill Number
                    <input
                      required
                      value={purchaseDraft.billNumber}
                      onChange={(e) =>
                        setPurchaseDraft({ ...purchaseDraft, billNumber: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Bill Date
                    <input
                      type="date"
                      required
                      value={purchaseDraft.billDate}
                      onChange={(e) =>
                        setPurchaseDraft({ ...purchaseDraft, billDate: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Payment Status
                    <select
                      value={purchaseDraft.paymentStatus}
                      onChange={(e) =>
                        setPurchaseDraft({ ...purchaseDraft, paymentStatus: e.target.value })
                      }
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="part_paid">Part Paid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </label>
                </div>
                <div className="purchase-lines">
                  <header>
                    <strong>Bill Items</strong>
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => setLines([...lines, emptyLine()])}
                    >
                      + Add Item
                    </button>
                  </header>
                  {lines.map((line, index) => (
                    <div className="purchase-line" key={index}>
                      <select
                        required
                        value={line.productId}
                        onChange={(e) => {
                          const product = products.find(({ id }) => id === e.target.value);
                          setLines(
                            lines.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    productId: e.target.value,
                                    gstRate: String(product?.gstRate ?? 18),
                                  }
                                : item,
                            ),
                          );
                        }}
                      >
                        <option value="">Select Product</option>
                        {products.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.sku}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Quantity"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines(
                            lines.map((item, i) =>
                              i === index ? { ...item, quantity: e.target.value } : item,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label="Unit cost"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit Cost"
                        value={line.unitCost}
                        onChange={(e) =>
                          setLines(
                            lines.map((item, i) =>
                              i === index ? { ...item, unitCost: e.target.value } : item,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label="GST rate"
                        type="number"
                        min="0"
                        max="100"
                        value={line.gstRate}
                        onChange={(e) =>
                          setLines(
                            lines.map((item, i) =>
                              i === index ? { ...item, gstRate: e.target.value } : item,
                            ),
                          )
                        }
                      />
                      <strong>
                        {money.format(
                          Number(line.quantity || 0) *
                            Number(line.unitCost || 0) *
                            (1 + Number(line.gstRate || 0) / 100),
                        )}
                      </strong>
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => setLines(lines.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="purchase-total">
                  <span>Taxable {money.format(purchaseTotals.taxable)}</span>
                  <span>GST {money.format(purchaseTotals.tax)}</span>
                  <strong>Total {money.format(purchaseTotals.grand)}</strong>
                </div>
                <footer className="modal-footer">
                  <button type="button" className="cancel-button" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button
                    className="dv-button"
                    disabled={saving || !suppliers.length || !products.length}
                  >
                    {saving ? "Posting…" : "Post Purchase & Update Stock"}
                  </button>
                </footer>
              </form>
            ) : null}
            {modal === "expense" ? (
              <form onSubmit={saveExpense} className="form-grid">
                <label>
                  Category
                  <select
                    value={expenseDraft.category}
                    onChange={(e) => setExpenseDraft({ ...expenseDraft, category: e.target.value })}
                  >
                    {expenseCategories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount (₹)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={expenseDraft.amount}
                    onChange={(e) => setExpenseDraft({ ...expenseDraft, amount: e.target.value })}
                  />
                </label>
                <label className="full">
                  Description
                  <input
                    required
                    minLength={2}
                    value={expenseDraft.description}
                    onChange={(e) =>
                      setExpenseDraft({ ...expenseDraft, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Expense Date
                  <input
                    type="date"
                    required
                    value={expenseDraft.expenseDate}
                    onChange={(e) =>
                      setExpenseDraft({ ...expenseDraft, expenseDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  Payment Method
                  <select
                    value={expenseDraft.paymentMethod}
                    onChange={(e) =>
                      setExpenseDraft({ ...expenseDraft, paymentMethod: e.target.value })
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </label>
                <label className="full">
                  Reference / Notes
                  <input
                    value={expenseDraft.reference}
                    onChange={(e) =>
                      setExpenseDraft({ ...expenseDraft, reference: e.target.value })
                    }
                  />
                </label>
                <footer className="modal-footer full">
                  <button type="button" className="cancel-button" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button className="dv-button" disabled={saving}>
                    {saving ? "Saving…" : "Record Expense"}
                  </button>
                </footer>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
