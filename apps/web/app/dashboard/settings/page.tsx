"use client";

import type { BusinessTaxProfile, GstRegistration, GstRegistrationType } from "@dvcs/types";
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
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
  invoiceStartNumber: 1,
  invoiceTerms: "",
  authorizedSignatory: "",
  phone: "",
  email: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifscCode: "",
  upiId: "",
  invoiceLogoUrl: "",
  invoiceAccentColor: "#173958",
  invoicePaperSize: "A4",
};

export default function BusinessSettingsPage() {
  const { user, memberships, activeCompany, activeCompanyId, activeBranchId, activeBranch } =
    useAuth();
  const [draft, setDraft] = useState<Draft>(emptyDraft),
    [exists, setExists] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [registrations, setRegistrations] = useState<GstRegistration[]>([]),
    [gstSetup, setGstSetup] = useState<"unregistered" | "existing" | "new">("unregistered");
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
  const today = new Date(),
    financialYearStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1,
    financialYearCode = `${String(financialYearStart).slice(-2)}${String(financialYearStart + 1).slice(-2)}`,
    invoicePrefixPreview =
      draft.invoicePrefix
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(0, 4) || "INV",
    invoiceNumberPreview = `${invoicePrefixPreview}/${financialYearCode}/${String(draft.invoiceStartNumber || 1).padStart(6, "0")}`;
  const load = useCallback(async () => {
    if (!activeCompanyId || !activeBranchId || !canView) return;
    setLoading(true);
    setMessage("");
    try {
      const branchSnapshot = await getDoc(
          doc(
            firebaseClient.db,
            "businessTaxProfiles",
            activeCompanyId,
            "branches",
            activeBranchId,
          ),
        ),
        registrationSnapshots = await getDocs(
          collection(firebaseClient.db, "businessTaxProfiles", activeCompanyId, "gstRegistrations"),
        ).catch(() => null),
        legacySnapshot = branchSnapshot.exists()
          ? null
          : await getDoc(doc(firebaseClient.db, "businessTaxProfiles", activeCompanyId)),
        snapshot = branchSnapshot.exists() ? branchSnapshot : legacySnapshot!,
        availableRegistrations = registrationSnapshots
          ? (registrationSnapshots.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })) as GstRegistration[])
          : [];
      if (!registrationSnapshots) {
        setMessage("GST registration access is not active yet. Deploy the latest Firestore rules.");
      }
      setRegistrations(availableRegistrations.filter(({ status }) => status !== "inactive"));
      if (snapshot.exists()) {
        const data = snapshot.data() as BusinessTaxProfile;
        setDraft({ ...emptyDraft, ...data });
        setGstSetup(
          !data.gstRegistered
            ? "unregistered"
            : data.gstRegistrationId &&
                availableRegistrations.some(({ id }) => id === data.gstRegistrationId)
              ? "existing"
              : "new",
        );
        setExists(branchSnapshot.exists());
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
  }, [activeBranchId, activeCompany?.name, activeCompanyId, canView]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const chooseRegistration = (registrationId: string) => {
    const registration = registrations.find(({ id }) => id === registrationId);
    if (!registration) return;
    setDraft((current) => ({
      ...current,
      gstRegistrationId: registration.id,
      gstRegistered: true,
      gstin: registration.gstin,
      legalName: registration.legalName,
      pan: registration.pan ?? current.pan,
      registrationType: registration.registrationType,
      state: registration.state,
      stateCode: registration.stateCode,
      invoicePrefix: registration.invoicePrefix,
      invoiceStartNumber: registration.invoiceStartNumber,
      invoiceSeriesKey: registration.invoiceSeriesKey,
    }));
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !activeCompanyId || !activeBranchId || !isOwner) return;
    const gstin = gstSetup === "unregistered" ? "" : (draft.gstin?.trim().toUpperCase() ?? ""),
      pan = draft.pan?.trim().toUpperCase() ?? "";
    if (gstSetup !== "unregistered" && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) {
      setMessage("Enter a valid 15-character GSTIN.");
      return;
    }
    if (gstSetup === "new" && registrations.some((item) => item.gstin === gstin)) {
      setMessage("This GSTIN already exists. Choose Use Existing Company GSTIN.");
      return;
    }
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      setMessage("Enter a valid PAN.");
      return;
    }
    const invoicePrefix = draft.invoicePrefix.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!invoicePrefix || invoicePrefix.length > 4) {
      setMessage("Invoice Prefix must contain 1 to 4 letters or numbers.");
      return;
    }
    if (
      !Number.isInteger(Number(draft.invoiceStartNumber)) ||
      Number(draft.invoiceStartNumber) < 1 ||
      Number(draft.invoiceStartNumber) > 999999
    ) {
      setMessage("Invoice Starting Number must be between 1 and 999999.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const now = serverTimestamp(),
        batch = writeBatch(firebaseClient.db),
        registrationId =
          gstSetup === "unregistered"
            ? ""
            : draft.gstRegistrationId || `${activeCompanyId}_${gstin}`,
        existingRegistration = registrations.find(({ id }) => id === registrationId),
        seriesKey =
          gstSetup === "unregistered"
            ? `${activeCompanyId}-UNREGISTERED-${activeBranchId}`
            : existingRegistration?.invoiceSeriesKey || draft.invoiceSeriesKey || gstin,
        ref = doc(
          firebaseClient.db,
          "businessTaxProfiles",
          activeCompanyId,
          "branches",
          activeBranchId,
        ),
        values = {
          ...draft,
          gstRegistrationId: registrationId,
          gstRegistered: gstSetup !== "unregistered",
          registrationType: gstSetup === "unregistered" ? "unregistered" : draft.registrationType,
          gstin,
          pan,
          invoicePrefix,
          invoiceStartNumber: Number(draft.invoiceStartNumber),
          companyId: activeCompanyId,
          branchId: activeBranchId,
          invoiceSeriesKey: seriesKey,
          updatedAt: now,
          updatedBy: user.uid,
        };
      if (gstSetup !== "unregistered") {
        const registrationRef = doc(
            firebaseClient.db,
            "businessTaxProfiles",
            activeCompanyId,
            "gstRegistrations",
            registrationId,
          ),
          registrationValues = {
            id: registrationId,
            companyId: activeCompanyId,
            gstin,
            legalName: draft.legalName.trim(),
            pan,
            registrationType: draft.registrationType === "composition" ? "composition" : "regular",
            state: draft.state.trim(),
            stateCode: draft.stateCode.trim(),
            invoicePrefix,
            invoiceStartNumber: Number(draft.invoiceStartNumber),
            invoiceSeriesKey: seriesKey,
            status: "active",
            updatedAt: now,
            updatedBy: user.uid,
          };
        batch.set(
          registrationRef,
          existingRegistration
            ? registrationValues
            : { ...registrationValues, createdAt: now, createdBy: user.uid },
          { merge: true },
        );
      }
      batch.set(ref, exists ? values : { ...values, createdAt: now, createdBy: user.uid }, {
        merge: true,
      });
      await batch.commit();
      setExists(true);
      await load();
      setMessage(`${activeBranch?.name ?? "Branch"} GST and invoice settings saved.`);
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
    options?: { type?: string; placeholder?: string; required?: boolean; disabled?: boolean },
  ) => (
    <label>
      {label}
      <input
        type={options?.type ?? "text"}
        value={String(draft[key] ?? "")}
        placeholder={options?.placeholder}
        required={options?.required}
        disabled={!isOwner || options?.disabled}
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
          <p className="muted">
            {activeBranch?.name ?? "Selected branch"} legal, tax and invoice information.
          </p>
        </div>
        <span className={`settings-access ${isOwner ? "is-owner" : ""}`}>
          {isOwner ? "Owner Editing" : "Read Only"}
        </span>
      </div>
      <nav className="settings-shortcuts" aria-label="Settings sections">
        <a href="#business-identity">Business</a>
        <a href="#gst-address">GST &amp; Address</a>
        <a href="#invoice-payment">Invoice &amp; Payment</a>
        <a className="is-primary" href="#invoice-editor">
          Invoice Editor
        </a>
      </nav>
      {message ? (
        <div className={`alert module-alert ${message.includes("saved") ? "" : "alert--error"}`}>
          {message}
        </div>
      ) : null}
      <form className="settings-form" onSubmit={save}>
        <section className="settings-card" id="business-identity">
          <header>
            <span>01</span>
            <div>
              <h2>Business Identity</h2>
              <p>Workshop details.</p>
            </div>
          </header>
          <div className="gst-setup-panel">
            <label>
              GST Setup For This Branch
              <select
                value={gstSetup}
                disabled={!isOwner}
                onChange={(event) => {
                  const value = event.target.value as typeof gstSetup;
                  setGstSetup(value);
                  if (value === "unregistered") {
                    setDraft((current) => ({
                      ...current,
                      gstRegistrationId: "",
                      gstRegistered: false,
                      gstin: "",
                      registrationType: "unregistered",
                    }));
                  } else if (value === "existing" && registrations[0]) {
                    chooseRegistration(registrations[0].id);
                  } else if (value === "new") {
                    setDraft((current) => ({
                      ...current,
                      gstRegistrationId: "",
                      gstRegistered: true,
                      gstin: "",
                      registrationType: "regular",
                      invoiceSeriesKey: "",
                    }));
                  }
                }}
              >
                <option value="unregistered">Not GST Registered</option>
                <option value="existing" disabled={!registrations.length}>
                  Use Existing Company GSTIN
                </option>
                <option value="new">Add A Different GSTIN</option>
              </select>
              <small>
                Choose the GST registration deliberately. The system never guesses from an address.
              </small>
            </label>
            {gstSetup === "existing" ? (
              <label>
                Company GST Registration
                <select
                  value={draft.gstRegistrationId ?? ""}
                  disabled={!isOwner}
                  onChange={(event) => chooseRegistration(event.target.value)}
                >
                  {registrations.map((registration) => (
                    <option key={registration.id} value={registration.id}>
                      {registration.gstin} · {registration.legalName}
                    </option>
                  ))}
                </select>
                <small>This branch will share the GST registration and invoice series.</small>
              </label>
            ) : null}
          </div>
          <div className="form-grid settings-fields-grid">
            {field("legalName", "Legal Business Name", {
              required: true,
              disabled: gstSetup === "existing",
            })}
            {field("tradeName", "Trade / Workshop Name", { required: true })}
            {gstSetup !== "unregistered" ? (
              <label>
                Registration Type
                <select
                  value={draft.registrationType}
                  disabled={!isOwner || gstSetup === "existing"}
                  onChange={(event) => {
                    const value = event.target.value as GstRegistrationType;
                    update("registrationType", value);
                    update("gstRegistered", value !== "unregistered");
                  }}
                >
                  <option value="regular">Regular</option>
                  <option value="composition">Composition</option>
                </select>
              </label>
            ) : null}
            {gstSetup !== "unregistered"
              ? field("gstin", "GSTIN", {
                  placeholder: "33ABCDE1234F1Z5",
                  required: true,
                  disabled: gstSetup === "existing",
                })
              : null}
            {field("pan", "PAN", { placeholder: "ABCDE1234F", disabled: gstSetup === "existing" })}
            {field("authorizedSignatory", "Authorized Signatory")}
          </div>
        </section>
        <section className="settings-card" id="gst-address">
          <header>
            <span>02</span>
            <div>
              <h2>Registered Address</h2>
              <p>This branch invoice/operating address. It may differ under the same GSTIN.</p>
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
        <section className="settings-card" id="invoice-payment">
          <header>
            <span>03</span>
            <div>
              <h2>Invoice &amp; Payment Details</h2>
              <p>
                {gstSetup === "existing"
                  ? "This branch shares the selected GST registration's invoice series."
                  : "Invoice numbering is attached to this branch's selected GST registration."}
              </p>
            </div>
          </header>
          <div className="form-grid">
            {field("invoicePrefix", "Invoice Prefix (Maximum 4 Characters)", { required: true })}
            <label>
              Invoice Starting Number
              <input
                type="number"
                min="1"
                max="999999"
                value={draft.invoiceStartNumber ?? 1}
                disabled={!isOwner}
                onChange={(event) => update("invoiceStartNumber", Number(event.target.value))}
              />
              <small>Used only when a new financial-year series starts.</small>
            </label>
            <label className="invoice-format-field span-2">
              Current Financial-Year Format
              <input value={invoiceNumberPreview} readOnly />
              <small>
                FY {financialYearStart}–{String(financialYearStart + 1).slice(-2)} · Consecutive and
                unique within this financial year.
              </small>
              <small>
                On 1 April, the FY code changes automatically and a new sequence starts from the
                configured starting number. The invoice prefix remains unchanged.
              </small>
            </label>
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
        <section className="settings-card invoice-editor-card" id="invoice-editor">
          <header>
            <span>04</span>
            <div>
              <h2>Invoice Editor</h2>
              <p>Logo, invoice color and A4/A5 print format.</p>
            </div>
          </header>
          <div className="form-grid invoice-design-fields">
            <div className="invoice-logo-editor span-2">
              <div>
                {field("invoiceLogoUrl", "Logo Image URL", {
                  placeholder: "https://yourdomain.com/logo.png",
                })}
                <small>
                  Recommended: transparent PNG or SVG, approximately 600 × 216 px (25:9 ratio).
                </small>
              </div>
              <div className="invoice-logo-preview" aria-label="Invoice logo preview">
                {draft.invoiceLogoUrl ? (
                  <img src={draft.invoiceLogoUrl} alt="Invoice logo preview" />
                ) : (
                  <span>
                    Your Logo
                    <br />
                    <small>Invoice print area</small>
                  </span>
                )}
              </div>
            </div>
            <label>
              Invoice Color
              <input
                type="color"
                value={draft.invoiceAccentColor || "#173958"}
                disabled={!isOwner}
                onChange={(event) => update("invoiceAccentColor", event.target.value)}
              />
            </label>
            <label>
              Paper Size
              <select
                value={draft.invoicePaperSize || "A4"}
                disabled={!isOwner}
                onChange={(event) => update("invoicePaperSize", event.target.value as "A4" | "A5")}
              >
                <option value="A4">A4 — Full Invoice</option>
                <option value="A5">A5 — Compact Invoice</option>
              </select>
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
