"use client";

import type {
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  Product,
  ProductType,
} from "@dvcs/types";
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";

type Draft = {
  name: string;
  nickname: string;
  sku: string;
  barcode: string;
  oemPartNumber: string;
  manufacturerPartNumber: string;
  brand: string;
  category: string;
  type: ProductType;
  description: string;
  hsnCode: string;
  gstRate: string;
  unit: string;
  mrp: string;
  trackInventory: boolean;
  compatibilityNotes: string;
  purchasePrice: string;
  sellingPrice: string;
  currentStock: string;
  reorderLevel: string;
  rackLocation: string;
  preferredSupplier: string;
};
const emptyDraft: Draft = {
  name: "",
  nickname: "",
  sku: "",
  barcode: "",
  oemPartNumber: "",
  manufacturerPartNumber: "",
  brand: "",
  category: "",
  type: "spare_part",
  description: "",
  hsnCode: "",
  gstRate: "18",
  unit: "NOS",
  mrp: "",
  trackInventory: true,
  compatibilityNotes: "",
  purchasePrice: "",
  sellingPrice: "",
  currentStock: "0",
  reorderLevel: "0",
  rackLocation: "",
  preferredSupplier: "",
};
const productTypes: Array<[ProductType, string]> = [
  ["spare_part", "Spare Part"],
  ["consumable", "Consumable"],
  ["lubricant", "Lubricant"],
  ["tyre", "Tyre"],
  ["battery", "Battery"],
  ["accessory", "Accessory"],
  ["workshop_material", "Workshop Material"],
];
const units = [
  ["NOS", "Numbers"],
  ["PCS", "Pieces"],
  ["LTR", "Litres"],
  ["MLT", "Millilitres"],
  ["KGS", "Kilograms"],
  ["GMS", "Grams"],
  ["MTR", "Metres"],
  ["SET", "Sets"],
  ["BOX", "Boxes"],
];
const gstRates = [0, 5, 12, 18, 28, 40];
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);

export default function ProductsPage() {
  const { user, memberships, activeCompanyId, activeBranchId, activeBranch } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [showMovement, setShowMovement] = useState(false);
  const [movementType, setMovementType] = useState<InventoryMovementType>("purchase");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementCost, setMovementCost] = useState("");
  const [movementSupplier, setMovementSupplier] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const membership = memberships.find(({ companyId }) => companyId === activeCompanyId);
  const canManageInventory =
    (membership?.companyRoles ?? []).some(
      (role) => role === "company_owner" || role === "company_admin",
    ) ||
    (membership?.branchAssignments ?? []).some(
      ({ branchId, roles }) =>
        branchId === activeBranchId &&
        roles.some((role) => role === "branch_manager" || role === "inventory_manager"),
    );

  const load = useCallback(async () => {
    if (!canManageInventory || !activeCompanyId || !activeBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const [productDocs, movementDocs, inventoryDocs] = await Promise.all([
        getDocs(
          query(
            collection(firebaseClient.db, "products"),
            where("companyId", "==", activeCompanyId),
          ),
        ),
        getDocs(
          query(
            collection(firebaseClient.db, "inventoryMovements"),
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
      ]);
      const nextProducts = productDocs.docs
        .map((item) => {
          const data = item.data();
          return {
            ...data,
            id: item.id,
            name: String(data.name ?? "Unnamed Product"),
            sku: String(data.sku ?? item.id),
            searchText: String(
              data.searchText ??
                `${data.name ?? ""} ${data.nickname ?? ""} ${data.sku ?? ""} ${data.barcode ?? ""} ${data.brand ?? ""}`,
            ).toLowerCase(),
          } as Product;
        })
        .filter(({ status }) => status === "active")
        .sort((a, b) => a.name.localeCompare(b.name));
      const nextInventory = inventoryDocs.docs
        .map((item) => ({ ...item.data(), id: item.id }) as InventoryItem)
        .filter(({ status }) => status === "active");
      setProducts(nextProducts);
      setInventory(nextInventory);
      setMovements(
        movementDocs.docs
          .map((item) => ({ ...item.data(), id: item.id }) as InventoryMovement)
          .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
      );
      setSelectedId((current) =>
        current && nextProducts.some(({ id }) => id === current)
          ? current
          : (nextProducts[0]?.id ?? null),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompanyId, canManageInventory]);
  useEffect(() => {
    void load();
  }, [load]);
  const inventoryFor = (productId: string) =>
    inventory.find((item) => item.productId === productId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const item = inventory.find(({ productId }) => productId === product.id);
      const matches =
        !term ||
        (product.searchText ?? "").includes(term) ||
        product.barcode?.toLowerCase().includes(term) ||
        product.oemPartNumber?.toLowerCase().includes(term);
      const stock = item?.currentStock ?? 0;
      const stockMatches =
        stockFilter === "all" ||
        (stockFilter === "out" && stock <= 0) ||
        (stockFilter === "low" && stock > 0 && stock <= (item?.reorderLevel ?? 0));
      return matches && stockMatches;
    });
  }, [inventory, products, search, stockFilter]);
  const selected = products.find(({ id }) => id === selectedId) ?? null;
  const selectedStock = selected ? inventoryFor(selected.id) : undefined;
  const selectedMovements = movements
    .filter(({ productId }) => productId === selectedId)
    .slice(0, 8);
  const totalStock = inventory.reduce((sum, item) => sum + item.currentStock, 0);
  const lowStock = inventory.filter((item) => item.currentStock <= item.reorderLevel).length;
  const stockValue = inventory.reduce(
    (sum, item) => sum + item.currentStock * item.purchasePrice,
    0,
  );

  function openNew() {
    setEditingId(null);
    setDraft(emptyDraft);
    setError(null);
    setShowForm(true);
  }
  function openEdit(product: Product) {
    const item = inventoryFor(product.id);
    setEditingId(product.id);
    setDraft({
      name: product.name,
      nickname: product.nickname ?? "",
      sku: product.sku,
      barcode: product.barcode ?? "",
      oemPartNumber: product.oemPartNumber ?? "",
      manufacturerPartNumber: product.manufacturerPartNumber ?? "",
      brand: product.brand ?? "",
      category: product.category ?? "",
      type: product.type,
      description: product.description ?? "",
      hsnCode: product.hsnCode ?? "",
      gstRate: String(product.gstRate),
      unit: product.unit,
      mrp: product.mrp != null ? String(product.mrp) : "",
      trackInventory: product.trackInventory,
      compatibilityNotes: product.compatibilityNotes ?? "",
      purchasePrice: item ? String(item.purchasePrice) : "",
      sellingPrice: item ? String(item.sellingPrice) : "",
      currentStock: item ? String(item.currentStock) : "0",
      reorderLevel: item ? String(item.reorderLevel) : "0",
      rackLocation: item?.rackLocation ?? "",
      preferredSupplier: item?.preferredSupplier ?? "",
    });
    setError(null);
    setShowForm(true);
  }
  function close() {
    if (submitting) return;
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setError(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId) return;
    const name = draft.name.trim(),
      sku = draft.sku.trim().toUpperCase(),
      barcode = draft.barcode.trim();
    if (name.length < 2 || !sku) {
      setError("Enter a Product Name and SKU.");
      return;
    }
    if (draft.trackInventory && Number(draft.currentStock) < 0) {
      setError("Current Stock cannot be negative.");
      return;
    }
    if (
      products.some(
        (product) =>
          product.id !== editingId && String(product.sku ?? "").toLowerCase() === sku.toLowerCase(),
      )
    ) {
      setError("This SKU already exists in your company catalogue.");
      return;
    }
    if (
      barcode &&
      products.some((product) => product.id !== editingId && product.barcode === barcode)
    ) {
      setError("This Barcode is already assigned to another product.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const now = serverTimestamp();
      const batch = writeBatch(firebaseClient.db);
      const productRef = editingId
        ? doc(firebaseClient.db, "products", editingId)
        : doc(collection(firebaseClient.db, "products"));
      const inventoryId =
        editingId && selectedStock ? selectedStock.id : `${activeBranchId}_${productRef.id}`;
      const itemRef = doc(firebaseClient.db, "inventoryItems", inventoryId);
      const productValues = {
        name,
        nickname: draft.nickname.trim(),
        sku,
        barcode,
        oemPartNumber: draft.oemPartNumber.trim().toUpperCase(),
        manufacturerPartNumber: draft.manufacturerPartNumber.trim().toUpperCase(),
        brand: draft.brand.trim(),
        category: draft.category.trim(),
        type: draft.type,
        description: draft.description.trim(),
        hsnCode: draft.hsnCode.replace(/\D/g, ""),
        gstRate: Number(draft.gstRate),
        unit: draft.unit,
        mrp: draft.mrp ? Number(draft.mrp) : null,
        trackInventory: draft.trackInventory,
        compatibilityNotes: draft.compatibilityNotes.trim(),
        searchText:
          `${name} ${draft.nickname} ${sku} ${barcode} ${draft.oemPartNumber} ${draft.brand}`.toLowerCase(),
        updatedAt: now,
        updatedBy: user.uid,
      };
      const inventoryValues = {
        purchasePrice: Number(draft.purchasePrice || 0),
        sellingPrice: Number(draft.sellingPrice || 0),
        currentStock: draft.trackInventory ? Number(draft.currentStock || 0) : 0,
        reservedStock: editingId ? (selectedStock?.reservedStock ?? 0) : 0,
        reorderLevel: draft.trackInventory ? Number(draft.reorderLevel || 0) : 0,
        rackLocation: draft.rackLocation.trim(),
        preferredSupplier: draft.preferredSupplier.trim(),
        updatedAt: now,
        updatedBy: user.uid,
      };
      if (editingId) {
        batch.update(productRef, productValues);
        if (selectedStock) {
          batch.update(itemRef, inventoryValues);
          const nextStock = Number(inventoryValues.currentStock),
            previousStock = Number(selectedStock.currentStock);
          if (nextStock !== previousStock) {
            const difference = nextStock - previousStock;
            batch.set(doc(collection(firebaseClient.db, "inventoryMovements")), {
              companyId: activeCompanyId,
              branchId: activeBranchId,
              productId: productRef.id,
              inventoryItemId: selectedStock.id,
              type: difference > 0 ? "adjustment_in" : "adjustment_out",
              quantity: Math.abs(difference),
              stockBefore: previousStock,
              stockAfter: nextStock,
              unitCost: Number(draft.purchasePrice || selectedStock.purchasePrice || 0),
              supplier: draft.preferredSupplier.trim(),
              reference: "Product Edit",
              notes: "Current Stock updated from the product form.",
              occurredAt: now,
              createdAt: now,
              createdBy: user.uid,
              updatedAt: now,
              updatedBy: user.uid,
            });
          }
        } else
          batch.set(itemRef, {
            companyId: activeCompanyId,
            branchId: activeBranchId,
            productId: productRef.id,
            ...inventoryValues,
            status: "active",
            createdAt: now,
            createdBy: user.uid,
          });
      } else {
        batch.set(productRef, {
          companyId: activeCompanyId,
          ...productValues,
          status: "active",
          createdAt: now,
          createdBy: user.uid,
        });
        batch.set(itemRef, {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          productId: productRef.id,
          ...inventoryValues,
          status: "active",
          createdAt: now,
          createdBy: user.uid,
        });
      }
      await batch.commit();
      setShowForm(false);
      setEditingId(null);
      setDraft(emptyDraft);
      await load();
      setSelectedId(productRef.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the product.");
    } finally {
      setSubmitting(false);
    }
  }
  async function archive() {
    if (
      !user ||
      !selected ||
      !confirm(
        `Archive ${selected.name}? Historical job and invoice records will remain unchanged.`,
      )
    )
      return;
    setSubmitting(true);
    try {
      const now = serverTimestamp();
      const batch = writeBatch(firebaseClient.db);
      batch.update(doc(firebaseClient.db, "products", selected.id), {
        status: "archived",
        updatedAt: now,
        updatedBy: user.uid,
      });
      if (selectedStock)
        batch.update(doc(firebaseClient.db, "inventoryItems", selectedStock.id), {
          status: "archived",
          updatedAt: now,
          updatedBy: user.uid,
        });
      await batch.commit();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive the product.");
    } finally {
      setSubmitting(false);
    }
  }

  async function recordMovement(event: FormEvent) {
    event.preventDefault();
    if (!user || !selected || !selectedStock || !activeCompanyId || !activeBranchId) return;
    const quantity = Number(movementQuantity),
      outgoing = movementType === "issue" || movementType === "adjustment_out";
    if (quantity <= 0) return setError("Enter a quantity greater than zero.");
    if (outgoing && quantity > selectedStock.currentStock)
      return setError("Quantity cannot exceed available stock.");
    setSubmitting(true);
    setError(null);
    try {
      const movementRef = doc(collection(firebaseClient.db, "inventoryMovements"));
      await runTransaction(firebaseClient.db, async (transaction) => {
        const itemRef = doc(firebaseClient.db, "inventoryItems", selectedStock.id),
          snapshot = await transaction.get(itemRef);
        if (!snapshot.exists()) throw new Error("Inventory item no longer exists.");
        const current = Number(snapshot.get("currentStock")),
          next = outgoing ? current - quantity : current + quantity,
          now = serverTimestamp();
        transaction.update(itemRef, {
          currentStock: next,
          ...(movementType === "purchase" && movementCost
            ? { purchasePrice: Number(movementCost) }
            : {}),
          updatedAt: now,
          updatedBy: user.uid,
        });
        transaction.set(movementRef, {
          companyId: activeCompanyId,
          branchId: activeBranchId,
          productId: selected.id,
          inventoryItemId: selectedStock.id,
          type: movementType,
          quantity,
          stockBefore: current,
          stockAfter: next,
          unitCost: Number(movementCost || selectedStock.purchasePrice || 0),
          supplier: movementSupplier.trim(),
          reference: movementReference.trim(),
          notes: movementNotes.trim(),
          occurredAt: now,
          createdAt: now,
          createdBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        });
      });
      setShowMovement(false);
      setMovementQuantity("");
      setMovementCost("");
      setMovementSupplier("");
      setMovementReference("");
      setMovementNotes("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update stock.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManageInventory)
    return (
      <main className="content">
        <div className="state-card">
          <h1>Inventory Access Required</h1>
          <p>This workspace is available to Owners, Branch Managers and Inventory Managers.</p>
        </div>
      </main>
    );

  return (
    <main className="content products-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">Parts &amp; Materials</span>
          <h1>Product Catalogue</h1>
          <p className="muted">Products, pricing and live stock.</p>
        </div>
        <button
          className="quick-action quick-action--enabled"
          onClick={openNew}
          disabled={!canManageInventory}
        >
          <strong>+</strong> Add Product
        </button>
      </div>
      {error && !showForm ? (
        <div className="alert alert--error module-alert">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      ) : null}
      <section className="inventory-guide">
        <strong>Stock Guide</strong>
        <span>
          <i className="is-good" /> Healthy — above reorder level
        </span>
        <span>
          <i className="is-attention" /> Low — purchase soon
        </span>
        <span>
          <i className="is-urgent" /> Out — workshop may be blocked
        </span>
        <span>
          <i className="is-active" /> Blue — stock activity
        </span>
      </section>
      <section className="product-summary">
        <div className="inventory-blue">
          <span>Products</span>
          <strong>{products.length}</strong>
        </div>
        <div className="inventory-navy">
          <span>Units In Stock</span>
          <strong>{totalStock.toLocaleString("en-IN")}</strong>
        </div>
        <div className={lowStock ? "inventory-red" : "inventory-green"}>
          <span>Low Stock</span>
          <strong>{lowStock}</strong>
          <small>
            {lowStock ? "Purchase or adjust these products" : "All stock levels look healthy"}
          </small>
        </div>
        <div className="inventory-green">
          <span>Stock Value</span>
          <strong>{money(stockValue)}</strong>
        </div>
      </section>
      <section className="product-workspace">
        <div className="product-directory">
          <div className="product-toolbar">
            <div className="search-box">
              <span>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Name, SKU, Barcode or Part Number"
              />
            </div>
            <div className="stock-filters">
              {(["all", "low", "out"] as const).map((value) => (
                <button
                  key={value}
                  className={stockFilter === value ? "is-active" : ""}
                  onClick={() => setStockFilter(value)}
                >
                  {value === "all" ? "All" : value === "low" ? "Low Stock" : "Out Of Stock"}
                </button>
              ))}
            </div>
          </div>
          <div className="product-list">
            {loading ? (
              <div className="list-state">
                <span className="spinner" />
                Loading Products…
              </div>
            ) : filtered.length === 0 ? (
              <div className="list-state list-state--empty">
                <strong>
                  {products.length ? "No Matching Products" : "Your Product Catalogue Is Ready"}
                </strong>
                <p>
                  {products.length
                    ? "Try another search or stock filter."
                    : "Add the first part, lubricant or workshop material."}
                </p>
              </div>
            ) : (
              filtered.map((product) => {
                const item = inventoryFor(product.id);
                const stock = item?.currentStock ?? 0;
                return (
                  <button
                    key={product.id}
                    className={`product-row ${selectedId === product.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedId(product.id)}
                  >
                    <span className="product-icon">{product.name.charAt(0).toUpperCase()}</span>
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {product.sku}
                        {product.nickname ? ` · ${product.nickname}` : ""}
                      </small>
                    </span>
                    <span
                      className={`stock-chip ${stock <= 0 ? "is-out" : stock <= (item?.reorderLevel ?? 0) ? "is-low" : ""}`}
                    >
                      {stock} {product.unit}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <aside className="product-detail">
          {selected ? (
            <>
              <div className="product-detail-head">
                <div>
                  <span className="heading-kicker">
                    {productTypes.find(([value]) => value === selected.type)?.[1]}
                  </span>
                  <h2>{selected.name}</h2>
                  <p>{selected.nickname || selected.brand || "Company Product"}</p>
                </div>
                {canManageInventory ? (
                  <button onClick={() => openEdit(selected)}>Edit Product</button>
                ) : null}
              </div>
              <div className="product-identity">
                <div>
                  <span>SKU</span>
                  <strong>{selected.sku}</strong>
                </div>
                <div>
                  <span>Barcode</span>
                  <strong>{selected.barcode || "Not Provided"}</strong>
                </div>
                <div>
                  <span>OEM Part Number</span>
                  <strong>{selected.oemPartNumber || "Not Provided"}</strong>
                </div>
                <div>
                  <span>HSN / GST</span>
                  <strong>
                    {selected.hsnCode || "—"} · {selected.gstRate}%
                  </strong>
                </div>
              </div>
              <div className="price-strip">
                <div>
                  <span>Purchase Price</span>
                  <strong>{money(selectedStock?.purchasePrice ?? 0)}</strong>
                </div>
                <div>
                  <span>Selling Price</span>
                  <strong>{money(selectedStock?.sellingPrice ?? 0)}</strong>
                </div>
                <div>
                  <span>MRP</span>
                  <strong>{money(selected.mrp ?? 0)}</strong>
                </div>
              </div>
              <div className="inventory-gauge">
                <div className="gauge-head">
                  <div>
                    <span className="heading-kicker">{activeBranch?.name} Inventory</span>
                    <h3>
                      {selectedStock?.currentStock ?? 0} {selected.unit} Available
                    </h3>
                  </div>
                  <span
                    className={
                      (selectedStock?.currentStock ?? 0) <= (selectedStock?.reorderLevel ?? 0)
                        ? "stock-status is-low"
                        : "stock-status"
                    }
                  >
                    {(selectedStock?.currentStock ?? 0) <= 0
                      ? "Out Of Stock"
                      : (selectedStock?.currentStock ?? 0) <= (selectedStock?.reorderLevel ?? 0)
                        ? "Reorder Now"
                        : "In Stock"}
                  </span>
                </div>
                <div className="stock-track">
                  <i
                    style={{
                      width: `${Math.min(100, ((selectedStock?.currentStock ?? 0) / Math.max((selectedStock?.reorderLevel ?? 1) * 2, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <div
                  className={`stock-explainer ${(selectedStock?.currentStock ?? 0) <= 0 ? "is-out" : (selectedStock?.currentStock ?? 0) <= (selectedStock?.reorderLevel ?? 0) ? "is-low" : "is-healthy"}`}
                >
                  <strong>
                    {(selectedStock?.currentStock ?? 0) <= 0
                      ? "Workshop Supply Risk"
                      : (selectedStock?.currentStock ?? 0) <= (selectedStock?.reorderLevel ?? 0)
                        ? "Purchase Recommended"
                        : "Stock Level Is Healthy"}
                  </strong>
                  <span>
                    {(selectedStock?.currentStock ?? 0) <= 0
                      ? "This product is unavailable. Receive stock before adding it to new work."
                      : (selectedStock?.currentStock ?? 0) <= (selectedStock?.reorderLevel ?? 0)
                        ? `Only ${selectedStock?.currentStock ?? 0} ${selected.unit} remain. The reorder level is ${selectedStock?.reorderLevel ?? 0}.`
                        : "No immediate purchase action is required."}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Reorder Level</dt>
                    <dd>
                      {selectedStock?.reorderLevel ?? 0} {selected.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Reserved</dt>
                    <dd>
                      {selectedStock?.reservedStock ?? 0} {selected.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Rack / Bin</dt>
                    <dd>{selectedStock?.rackLocation || "Not Set"}</dd>
                  </div>
                  <div>
                    <dt>Supplier</dt>
                    <dd>{selectedStock?.preferredSupplier || "Not Set"}</dd>
                  </div>
                </dl>
                {canManageInventory && selectedStock ? (
                  <button
                    className="dv-button stock-movement-button"
                    onClick={() => {
                      setMovementType("purchase");
                      setMovementCost(String(selectedStock.purchasePrice || ""));
                      setMovementSupplier(selectedStock.preferredSupplier ?? "");
                      setError(null);
                      setShowMovement(true);
                    }}
                  >
                    Receive / Adjust Stock
                  </button>
                ) : null}
              </div>
              <section className="stock-history">
                <div>
                  <span className="heading-kicker">Audit Trail</span>
                  <h3>Recent Stock Movements</h3>
                </div>
                {selectedMovements.length ? (
                  selectedMovements.map((movement) => (
                    <article key={movement.id}>
                      <span>
                        <strong>{movement.type.replaceAll("_", " ")}</strong>
                        <small>{movement.reference || movement.supplier || "Stock Update"}</small>
                      </span>
                      <span>
                        <strong>
                          {movement.type === "issue" || movement.type === "adjustment_out"
                            ? "−"
                            : "+"}
                          {movement.quantity} {selected.unit}
                        </strong>
                        <small>
                          {movement.stockBefore} → {movement.stockAfter}
                        </small>
                      </span>
                    </article>
                  ))
                ) : (
                  <p>No stock movements recorded yet.</p>
                )}
              </section>
              {selected.compatibilityNotes ? (
                <div className="compatibility-note">
                  <span>Vehicle Compatibility</span>
                  <p>{selected.compatibilityNotes}</p>
                </div>
              ) : null}
              <div className="detail-footer">
                <button
                  className="text-action"
                  onClick={() => void archive()}
                  disabled={!canManageInventory}
                >
                  Archive Product
                </button>
                <button className="job-action" disabled>
                  Add To Job Card <span>→</span>
                </button>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <h2>Select A Product</h2>
              <p>Choose a product to view details.</p>
            </div>
          )}
        </aside>
      </section>
      {showForm ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <form className="module-modal product-modal" onSubmit={save}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">
                  {editingId ? "Update Catalogue" : "New Catalogue Item"}
                </span>
                <h2>{editingId ? "Edit Product" : "Add Product"}</h2>
              </div>
              <button type="button" onClick={close}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="form-section">
              <h3>Product Identity</h3>
              <div className="form-grid">
                <label>
                  Product Name *
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    autoFocus
                    required
                  />
                </label>
                <label>
                  Product Nickname
                  <input
                    value={draft.nickname}
                    onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
                  />
                </label>
                <label>
                  SKU *
                  <input
                    value={draft.sku}
                    onChange={(e) => setDraft({ ...draft, sku: e.target.value.toUpperCase() })}
                    required
                  />
                </label>
                <label>
                  Barcode
                  <input
                    value={draft.barcode}
                    onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                  />
                </label>
                <label>
                  OEM Part Number
                  <input
                    value={draft.oemPartNumber}
                    onChange={(e) =>
                      setDraft({ ...draft, oemPartNumber: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label>
                  Manufacturer Part Number
                  <input
                    value={draft.manufacturerPartNumber}
                    onChange={(e) =>
                      setDraft({ ...draft, manufacturerPartNumber: e.target.value.toUpperCase() })
                    }
                  />
                </label>
                <label>
                  Brand
                  <input
                    value={draft.brand}
                    onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                  />
                </label>
                <label>
                  Category
                  <input
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  />
                </label>
                <label>
                  Product Type
                  <select
                    value={draft.type}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value as ProductType })}
                  >
                    {productTypes.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unit
                  <select
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  >
                    {units.map(([value, label]) => (
                      <option value={value} key={value}>
                        {label} ({value})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Description
                  <textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </label>
              </div>
            </div>
            <div className="form-section">
              <h3>Price &amp; Tax</h3>
              <div className="form-grid">
                <label>
                  Purchase Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.purchasePrice}
                    onChange={(e) => setDraft({ ...draft, purchasePrice: e.target.value })}
                  />
                </label>
                <label>
                  Selling Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.sellingPrice}
                    onChange={(e) => setDraft({ ...draft, sellingPrice: e.target.value })}
                  />
                </label>
                <label>
                  MRP
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.mrp}
                    onChange={(e) => setDraft({ ...draft, mrp: e.target.value })}
                  />
                </label>
                <label>
                  GST Rate
                  <select
                    value={draft.gstRate}
                    onChange={(e) => setDraft({ ...draft, gstRate: e.target.value })}
                  >
                    {gstRates.map((value) => (
                      <option value={value} key={value}>
                        {value}%
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  HSN Code
                  <input
                    inputMode="numeric"
                    value={draft.hsnCode}
                    onChange={(e) => setDraft({ ...draft, hsnCode: e.target.value })}
                  />
                </label>
              </div>
            </div>
            <div className="form-section">
              <h3>{activeBranch?.name} Inventory</h3>
              <div className="form-grid">
                <label>
                  Current Stock
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    disabled={!draft.trackInventory}
                    value={draft.currentStock}
                    onChange={(e) => setDraft({ ...draft, currentStock: e.target.value })}
                  />
                  <small>Changes are saved in Stock History as an adjustment.</small>
                </label>
                <label>
                  Reorder Level
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    disabled={!draft.trackInventory}
                    value={draft.reorderLevel}
                    onChange={(e) => setDraft({ ...draft, reorderLevel: e.target.value })}
                  />
                </label>
                <label>
                  Rack / Bin Location
                  <input
                    value={draft.rackLocation}
                    onChange={(e) => setDraft({ ...draft, rackLocation: e.target.value })}
                  />
                </label>
                <label>
                  Preferred Supplier
                  <input
                    value={draft.preferredSupplier}
                    onChange={(e) => setDraft({ ...draft, preferredSupplier: e.target.value })}
                  />
                </label>
                <label className="span-2 inline-catalogue-option">
                  <input
                    type="checkbox"
                    checked={draft.trackInventory}
                    onChange={(e) => setDraft({ ...draft, trackInventory: e.target.checked })}
                  />
                  <span>
                    <strong>Track Inventory For This Product</strong>
                    <small>
                      Disable for workshop materials that do not need quantity tracking.
                    </small>
                  </span>
                </label>
                <label className="span-2">
                  Vehicle Compatibility
                  <textarea
                    rows={2}
                    value={draft.compatibilityNotes}
                    onChange={(e) => setDraft({ ...draft, compatibilityNotes: e.target.value })}
                    placeholder="Example: Maruti Suzuki Swift 2018–2024 Petrol"
                  />
                </label>
              </div>
            </div>
            <footer className="modal-footer">
              <button type="button" className="cancel-button" onClick={close}>
                Cancel
              </button>
              <button className="dv-button" disabled={submitting}>
                {submitting ? "Saving…" : editingId ? "Save Changes" : "Add Product"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {showMovement && selected && selectedStock ? (
        <div className="modal-backdrop">
          <form className="module-modal" onSubmit={recordMovement}>
            <header className="modal-header">
              <div>
                <span className="heading-kicker">
                  {selected.sku} · {activeBranch?.name}
                </span>
                <h2>Stock Movement</h2>
              </div>
              <button type="button" onClick={() => setShowMovement(false)}>
                ×
              </button>
            </header>
            {error ? <div className="alert alert--error modal-alert">{error}</div> : null}
            <div className="form-grid">
              <label>
                Movement Type
                <select
                  value={movementType}
                  onChange={(event) => setMovementType(event.target.value as InventoryMovementType)}
                >
                  <option value="purchase">Purchase / Stock In</option>
                  <option value="issue">Manual Stock Out</option>
                  <option value="adjustment_in">Positive Adjustment</option>
                  <option value="adjustment_out">Negative Adjustment</option>
                </select>
              </label>
              <label>
                Quantity ({selected.unit})
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={movementQuantity}
                  onChange={(event) => setMovementQuantity(event.target.value)}
                  required
                />
              </label>
              <label>
                Unit Cost
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={movementCost}
                  onChange={(event) => setMovementCost(event.target.value)}
                />
              </label>
              <label>
                Supplier
                <input
                  value={movementSupplier}
                  onChange={(event) => setMovementSupplier(event.target.value)}
                  placeholder="Supplier or vendor name"
                />
              </label>
              <label>
                Invoice / Reference
                <input
                  value={movementReference}
                  onChange={(event) => setMovementReference(event.target.value)}
                  placeholder="Purchase invoice or adjustment reference"
                />
              </label>
              <label className="span-2">
                Reason / Notes
                <textarea
                  rows={2}
                  value={movementNotes}
                  onChange={(event) => setMovementNotes(event.target.value)}
                  required={movementType !== "purchase"}
                />
              </label>
              <div className="span-2 stock-preview">
                <span>
                  Current{" "}
                  <strong>
                    {selectedStock.currentStock} {selected.unit}
                  </strong>
                </span>
                <span>
                  After Movement{" "}
                  <strong>
                    {Math.max(
                      0,
                      selectedStock.currentStock +
                        (movementType === "issue" || movementType === "adjustment_out"
                          ? -Number(movementQuantity || 0)
                          : Number(movementQuantity || 0)),
                    )}{" "}
                    {selected.unit}
                  </strong>
                </span>
              </div>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowMovement(false)}
              >
                Cancel
              </button>
              <button className="dv-button" disabled={submitting}>
                {submitting ? "Saving…" : "Save Stock Movement"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
