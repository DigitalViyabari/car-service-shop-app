"use client";

import type { BusinessTaxProfile, GstRegistrationType } from "@dvcs/types";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";

type Draft = Omit<
  BusinessTaxProfile,
  "id" | "companyId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;
const emptyDraft: Draft = {
  legalName: "",
  tradeName: "",
  gstRegistered: false,
  gstin: "",
  pan: "",
  registrationType: "unregistered",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "Tamil Nadu",
  stateCode: "33",
  postalCode: "",
  invoicePrefix: "INV",
  invoiceTerms: "",
  authorizedSignatory: "",
  phone: "",
  email: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifscCode: "",
  upiId: "",
};

export default function BusinessSettingsPage() {
  const { user, memberships, activeCompany, activeCompanyId } = useAuth();
  const [draft, setDraft] = useState<Draft>(emptyDraft),
    [exists, setExists] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const membership = memberships.find(({ companyId }) => companyId === activeCompanyId),
    isOwner = (membership?.companyRoles ?? []).some(
      (role) => role === "company_owner" || role === "company_admin",
    ),
    canView =
      isOwner ||
      (membership?.companyRoles ?? []).includes("company_accountant") ||
      (membership?.branchAssignments ?? []).some(({ roles }) =>
        roles.some((role) => role === "branch_manager" || role === "finance_manager"),
      );
  const load = useCallback(async () => {
    if (!activeCompanyId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const snapshot = await getDoc(doc(firebaseClient.db, "businessTaxProfiles", activeCompanyId));
      if (snapshot.exists()) {
        const data = snapshot.data() as BusinessTaxProfile;
        setDraft({ ...emptyDraft, ...data });
        setExists(true);
      } else {
        setDraft({
          ...emptyDraft,
          legalName: activeCompany?.name ?? "",
          tradeName: activeCompany?.name ?? "",
        });
        setExists(false);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to load business settings.");
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.name, activeCompanyId, canView]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !isOwner) return;
    const gstin = draft.gstin?.trim().toUpperCase() ?? "",
      pan = draft.pan?.trim().toUpperCase() ?? "";
    if (draft.gstRegistered && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) {
      setMessage("Enter a valid 15-character GSTIN.");
      return;
    }
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      setMessage("Enter a valid PAN.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const now = serverTimestamp(),
        ref = doc(firebaseClient.db, "businessTaxProfiles", activeCompanyId),
        values = {
          ...draft,
          gstin,
          pan,
          invoicePrefix: draft.invoicePrefix.trim().toUpperCase(),
          companyId: activeCompanyId,
          updatedAt: now,
          updatedBy: user.uid,
        };
      await setDoc(ref, exists ? values : { ...values, createdAt: now, createdBy: user.uid }, {
        merge: true,
      });
      setExists(true);
      setMessage("Business and GST settings saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save business settings.");
    } finally {
      setSaving(false);
    }
  }
  if (!canView)
    return (
      <main className="content">
        <div className="state-card">
          <h1>Settings Access Required</h1>
          <p>Business GST information is available to the Owner and authorized finance managers.</p>
        </div>
      </main>
    );
  if (loading)
    return (
      <main className="content">
        <div className="list-state">
          <span className="spinner" />
          Loading Business Settings…
        </div>
      </main>
    );
  const field = (
    key: keyof Draft,
    label: string,
    options?: { type?: string; placeholder?: string; required?: boolean },
  ) => (
    <label>
      {label}
      <input
        type={options?.type ?? "text"}
        value={String(draft[key] ?? "")}
        placeholder={options?.placeholder}
        required={options?.required}
        disabled={!isOwner}
        onChange={(event) => update(key, event.target.value as never)}
      />
    </label>
  );
  return (
    <main className="content settings-page">
      <div className="dashboard-heading">
        <div>
          <span className="heading-kicker">Company Settings</span>
          <h1>Business &amp; GST</h1>
          <p className="muted">Legal, tax and payment information used on invoices and receipts.</p>
        </div>
        <span className={`settings-access ${isOwner ? "is-owner" : ""}`}>
          {isOwner ? "Owner Editing" : "Read Only"}
        </span>
      </div>
      {message ? (
        <div className={`alert module-alert ${message.includes("saved") ? "" : "alert--error"}`}>
          {message}
        </div>
      ) : null}
      <form className="settings-form" onSubmit={save}>
        <section className="settings-card">
          <header>
            <span>01</span>
            <div>
              <h2>Business Identity</h2>
              <p>Legal and customer-facing workshop information.</p>
            </div>
          </header>
          <div className="form-grid">
            {field("legalName", "Legal Business Name", { required: true })}
            {field("tradeName", "Trade / Workshop Name", { required: true })}
            <label>
              GST Registration
              <select
                value={draft.registrationType}
                disabled={!isOwner}
                onChange={(event) => {
                  const value = event.target.value as GstRegistrationType;
                  update("registrationType", value);
                  update("gstRegistered", value !== "unregistered");
                }}
              >
                <option value="unregistered">Unregistered</option>
                <option value="regular">Regular</option>
                <option value="composition">Composition</option>
              </select>
            </label>
            {field("gstin", "GSTIN", {
              placeholder: "33ABCDE1234F1Z5",
              required: draft.gstRegistered,
            })}
            {field("pan", "PAN", { placeholder: "ABCDE1234F" })}
            {field("authorizedSignatory", "Authorized Signatory")}
          </div>
        </section>
        <section className="settings-card">
          <header>
            <span>02</span>
            <div>
              <h2>Registered Address</h2>
              <p>Place of supply and invoice address.</p>
            </div>
          </header>
          <div className="form-grid">
            {field("addressLine1", "Address Line 1", { required: true })}
            {field("addressLine2", "Address Line 2")}
            {field("city", "City", { required: true })}
            {field("state", "State", { required: true })}
            {field("stateCode", "GST State Code", { required: true })}
            {field("postalCode", "PIN Code", { required: true })}
            {field("phone", "Business Phone")}
            {field("email", "Business Email", { type: "email" })}
          </div>
        </section>
        <section className="settings-card">
          <header>
            <span>03</span>
            <div>
              <h2>Invoice &amp; Payment Details</h2>
              <p>Defaults printed on customer documents.</p>
            </div>
          </header>
          <div className="form-grid">
            {field("invoicePrefix", "Invoice Prefix", { required: true })}
            {field("upiId", "UPI ID")}
            {field("bankName", "Bank Name")}
            {field("accountName", "Account Name")}
            {field("accountNumber", "Account Number")}
            {field("ifscCode", "IFSC Code")}
            <label className="span-2">
              Invoice Terms
              <textarea
                rows={3}
                value={draft.invoiceTerms ?? ""}
                disabled={!isOwner}
                onChange={(event) => update("invoiceTerms", event.target.value)}
                placeholder="Payment, warranty and delivery terms"
              />
            </label>
          </div>
        </section>
        {isOwner ? (
          <footer className="settings-save">
            <button className="dv-button" disabled={saving}>
              {saving ? "Saving…" : "Save Business & GST Settings"}
            </button>
          </footer>
        ) : null}
      </form>
    </main>
  );
}
