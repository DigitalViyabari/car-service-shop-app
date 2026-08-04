"use client";

import type { BusinessTaxProfile, GstRegistration, GstRegistrationType } from "@dvcs/types";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";

type Draft = Omit<
  BusinessTaxProfile,
  "id" | "companyId" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"
>;
type BranchTaxSetup = {
  branchId: string;
  branchName: string;
  gstRegistrationId: string;
  gstin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  invoicePrefix: string;
  invoiceStartNumber: number;
};
function comparableAddress(...parts: Array<string | undefined>) {
  return parts
    .map((part) =>
      (part ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, ""),
    )
    .filter(Boolean)
    .join("|");
}
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
  branchAddressName: "",
  registeredAddressLine1: "",
  registeredAddressLine2: "",
  registeredCity: "",
  registeredPostalCode: "",
  invoiceAddressMode: "branch",
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
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [messageType, setMessageType] = useState<"success" | "error" | "">(""),
    [prefixError, setPrefixError] = useState(""),
    [registrations, setRegistrations] = useState<GstRegistration[]>([]),
    [branchSetups, setBranchSetups] = useState<BranchTaxSetup[]>([]),
    [gstSetup, setGstSetup] = useState<"unregistered" | "existing" | "new">("unregistered"),
    messageRef = useRef<HTMLDivElement>(null),
    prefixRef = useRef<HTMLInputElement>(null);
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
    invoiceNumberPreview = `${invoicePrefixPreview}/${financialYearCode}/${String(draft.invoiceStartNumber || 1).padStart(6, "0")}`,
    currentAddress = comparableAddress(
      draft.addressLine1,
      draft.addressLine2,
      draft.city,
      draft.state,
      draft.stateCode,
      draft.postalCode,
    ),
    otherBranches = branchSetups.filter(({ branchId }) => branchId !== activeBranchId),
    sameGstBranches = otherBranches.filter(
      (branch) =>
        gstSetup !== "unregistered" &&
        ((draft.gstRegistrationId && branch.gstRegistrationId === draft.gstRegistrationId) ||
          (!!draft.gstin && branch.gstin.toUpperCase() === draft.gstin.trim().toUpperCase())),
    ),
    sameAddressBranch = sameGstBranches.find(
      (branch) =>
        comparableAddress(
          branch.addressLine1,
          branch.addressLine2,
          branch.city,
          branch.state,
          branch.stateCode,
          branch.postalCode,
        ) === currentAddress,
    ),
    setupResult =
      gstSetup === "unregistered"
        ? "branch"
        : sameAddressBranch
          ? "shared"
          : sameGstBranches.length
            ? "branch"
            : "gst",
    referenceBranch = sameAddressBranch ?? sameGstBranches[0],
    currentStart = Math.max(1, Number(draft.invoiceStartNumber) || 1),
    currentInvoiceExample = `${invoicePrefixPreview}/${financialYearCode}/${String(currentStart).padStart(6, "0")}`,
    referencePrefix =
      referenceBranch?.invoicePrefix.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "INV",
    referenceStart = Math.max(1, Number(referenceBranch?.invoiceStartNumber) || 1),
    referenceInvoiceExample = `${referencePrefix}/${financialYearCode}/${String(referenceStart).padStart(6, "0")}`,
    sharedNextExample = `${invoicePrefixPreview}/${financialYearCode}/${String(currentStart + 1).padStart(6, "0")}`;
  const load = useCallback(async () => {
    if (!user || !activeCompanyId || !activeBranchId || !canView) return;
    setLoading(true);
    setMessage("");
    setMessageType("");
    setPrefixError("");
    try {
      const response = await fetch(
          `/api/v1/settings/business?companyId=${encodeURIComponent(activeCompanyId)}&branchId=${encodeURIComponent(activeBranchId)}`,
          { headers: { authorization: `Bearer ${await user.getIdToken()}` } },
        ),
        result = (await response.json()) as {
          exists?: boolean;
          profile?: BusinessTaxProfile | null;
          registrations?: GstRegistration[];
          branchSetups?: BranchTaxSetup[];
          error?: string;
        };
      if (!response.ok) throw new Error(result.error ?? "Unable to load business settings.");
      const availableRegistrations = result.registrations ?? [];
      setRegistrations(availableRegistrations.filter(({ status }) => status !== "inactive"));
      setBranchSetups(result.branchSetups ?? []);
      if (result.profile) {
        const data = result.profile;
        setDraft({ ...emptyDraft, ...data });
        setGstSetup(
          !data.gstRegistered
            ? "unregistered"
            : data.gstRegistrationId &&
                availableRegistrations.some(({ id }) => id === data.gstRegistrationId)
              ? "existing"
              : "new",
        );
      } else {
        setDraft({
          ...emptyDraft,
          legalName: activeCompany?.name ?? "",
          tradeName: activeCompany?.name ?? "",
        });
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to load business settings.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, activeCompany?.name, activeCompanyId, canView, user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!message) return;
    window.requestAnimationFrame(() => {
      messageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      messageRef.current?.focus({ preventScroll: true });
    });
  }, [message]);
  const showMessage = (text: string, type: "success" | "error") => {
    setMessage(text);
    setMessageType(type);
  };
  const showPrefixError = () => {
    setPrefixError("Different address should have a different prefix.");
    window.requestAnimationFrame(() => {
      prefixRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      prefixRef.current?.focus({ preventScroll: true });
    });
  };
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
      registeredAddressLine1: registration.registeredAddressLine1 ?? "",
      registeredAddressLine2: registration.registeredAddressLine2 ?? "",
      registeredCity: registration.registeredCity ?? "",
      registeredPostalCode: registration.registeredPostalCode ?? "",
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
      showMessage("Enter a valid 15-character GSTIN.", "error");
      return;
    }
    if (gstSetup === "new" && registrations.some((item) => item.gstin === gstin)) {
      showMessage("This GSTIN already exists. Choose Use Existing Company GSTIN.", "error");
      return;
    }
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      showMessage("Enter a valid PAN.", "error");
      return;
    }
    const invoicePrefix =
        draft.invoicePrefix
          .replace(/[^A-Za-z0-9]/g, "")
          .toUpperCase()
          .slice(0, 4) || "INV",
      invoiceStartNumber =
        Number.isInteger(Number(draft.invoiceStartNumber)) && Number(draft.invoiceStartNumber) > 0
          ? Number(draft.invoiceStartNumber)
          : 1;
    if (
      setupResult === "branch" &&
      sameGstBranches.some((branch) => branch.invoicePrefix.trim().toUpperCase() === invoicePrefix)
    ) {
      showPrefixError();
      return;
    }
    setSaving(true);
    setMessage("");
    setMessageType("");
    setPrefixError("");
    try {
      const response = await fetch("/api/v1/settings/business", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify({
            companyId: activeCompanyId,
            branchId: activeBranchId,
            gstSetup,
            profile: {
              ...draft,
              gstin,
              pan,
              invoicePrefix,
              invoiceStartNumber,
              invoiceAddressMode: "branch",
            },
          }),
        }),
        result = (await response.json()) as {
          saved?: boolean;
          invoiceSeriesMode?: "shared" | "branch";
          error?: string;
        };
      if (!response.ok) throw new Error(result.error ?? "Unable to save business settings.");
      await load();
      showMessage(
        `${activeBranch?.name ?? "Branch"} was saved successfully. ${
          result.invoiceSeriesMode === "branch"
            ? "Invoice Setup: Separate For This Branch."
            : "Invoice Setup: Shared With Main Branch."
        }`,
        "success",
      );
    } catch (reason) {
      if (
        reason instanceof Error &&
        /invoice prefix is already used|different invoice prefix/i.test(reason.message)
      ) {
        showPrefixError();
        return;
      }
      showMessage(
        `Your changes were not saved. ${
          reason instanceof Error ? reason.message : "Unable to save business settings."
        }`,
        "error",
      );
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
        <div
          ref={messageRef}
          className={`alert module-alert ${messageType === "error" ? "alert--error" : "alert--success"}`}
          role={messageType === "error" ? "alert" : "status"}
          tabIndex={-1}
        >
          <strong>{messageType === "error" ? "Not Saved" : "Saved"}</strong>
          <span>{message}</span>
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
                      invoiceAddressMode: "branch",
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
                      invoiceAddressMode: "branch",
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
                <small>
                  This selects the GST identity. Address and invoice series are chosen below.
                </small>
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
              <h2>Branch &amp; Invoice Address</h2>
              <p>Keep the workshop location separate from the GST-registered address.</p>
            </div>
          </header>
          <div className="form-grid">
            <div className="settings-subheading span-2">
              <strong>Branch / Workshop Address</strong>
              <small>The physical location of this branch.</small>
            </div>
            {field("branchAddressName", "Location Name", { placeholder: "Chennai Workshop" })}
            {field("addressLine1", "Branch Address Line 1", { required: true })}
            {field("addressLine2", "Branch Address Line 2")}
            {field("city", "Branch City", { required: true })}
            {field("state", "Branch State", { required: true })}
            {field("stateCode", "State Code", { required: true })}
            {field("postalCode", "Branch PIN Code", { required: true })}
            {field("phone", "Branch Phone")}
            {field("email", "Branch Email", { type: "email" })}
            {gstSetup === "new" ? (
              <>
                <div className="settings-subheading span-2">
                  <strong>GST-Registered Address</strong>
                  <small>Enter this once for the new GST registration.</small>
                </div>
                {field("registeredAddressLine1", "Registered Address Line 1", {
                  required: true,
                })}
                {field("registeredAddressLine2", "Registered Address Line 2")}
                {field("registeredCity", "Registered City", {
                  required: true,
                })}
                {field("registeredPostalCode", "Registered PIN Code", {
                  required: true,
                })}
              </>
            ) : null}
          </div>
        </section>
        <section className="settings-card" id="invoice-payment">
          <header>
            <span>03</span>
            <div>
              <h2>Invoice &amp; Payment Details</h2>
              <p>No invoice setup needed.</p>
            </div>
          </header>
          <div className="form-grid">
            <div
              className={`span-2 automatic-series-card automatic-series-card--${setupResult}`}
              role="status"
              aria-live="polite"
            >
              <strong>
                {setupResult === "shared"
                  ? "Invoice Numbers Will Be Shared"
                  : setupResult === "branch"
                    ? "This Branch Will Have Separate Invoice Numbers"
                    : "This GSTIN Will Have Separate Invoice Numbers"}
              </strong>
              <p>
                {setupResult === "shared"
                  ? `Same GSTIN and same address as ${referenceBranch?.branchName ?? "Main Branch"}. Both branches will continue one numbering list.`
                  : setupResult === "branch" && sameGstBranches.length
                    ? `The GSTIN is the same, but this branch address is different from ${referenceBranch?.branchName ?? "the other branch"}. Each address will have its own numbering.`
                    : gstSetup === "unregistered"
                      ? "This branch is not GST registered, so it will keep its own invoice numbers."
                      : "This GSTIN is different from the other branches, so it will keep its own invoice numbers."}
              </p>
              <small>
                {setupResult === "shared"
                  ? `Example: ${referenceBranch?.branchName ?? "Main Branch"} uses ${currentInvoiceExample}; this branch continues with ${sharedNextExample}.`
                  : setupResult === "branch" && referenceBranch
                    ? `Example: ${referenceBranch.branchName} uses ${referenceInvoiceExample}; this branch starts separately with ${currentInvoiceExample}.`
                    : `Example: This branch uses its own number, such as ${currentInvoiceExample}.`}
              </small>
            </div>
            <label className={prefixError ? "field-with-error" : ""}>
              Invoice Prefix (Maximum 4 Characters)
              <input
                ref={prefixRef}
                value={draft.invoicePrefix}
                placeholder="INV"
                required
                disabled={!isOwner}
                aria-invalid={Boolean(prefixError)}
                aria-describedby={prefixError ? "invoice-prefix-error" : undefined}
                title={prefixError || undefined}
                onChange={(event) => {
                  setPrefixError("");
                  update("invoicePrefix", event.target.value);
                }}
              />
              {prefixError ? (
                <small className="field-error-tooltip" id="invoice-prefix-error" role="tooltip">
                  <strong>Not Saved.</strong> {prefixError}
                </small>
              ) : null}
            </label>
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
              <small>Used when a new financial year starts.</small>
            </label>
            <label className="invoice-format-field span-2">
              Invoice Number Preview
              <input value={invoiceNumberPreview} readOnly />
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
