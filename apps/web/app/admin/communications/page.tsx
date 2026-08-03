"use client";

import type { CommunicationEntitlement, Company } from "@dvcs/types";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient, getFirebaseAppCheckToken } from "@/lib/firebase-client";

type Secrets = { sms: string; whatsapp: string; integratedNumber: string };
const emptySecrets = (): Secrets => ({ sms: "", whatsapp: "", integratedNumber: "" });
const blank = (companyId: string): CommunicationEntitlement => ({
  id: companyId,
  companyId,
  emailEnabled: true,
  pushEnabled: true,
  smsEnabled: false,
  whatsappEnabled: false,
  smsUnitRate: 0.25,
  whatsappUnitRate: 0.15,
  smsCredits: 0,
  whatsappCredits: 0,
  smsLowBalanceAt: 100,
  whatsappLowBalanceAt: 100,
  smsCredentialConfigured: false,
  whatsappCredentialConfigured: false,
  provider: "msg91",
  status: "active",
  createdAt: "",
  createdBy: "",
  updatedAt: "",
  updatedBy: "",
});

export default function CommunicationsAdmin() {
  const { user, profile, loading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [items, setItems] = useState<Record<string, CommunicationEntitlement>>({});
  const [credentials, setCredentials] = useState<Record<string, Secrets>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("all");
  const allowed = profile?.platformRoles?.includes("platform_super_admin");

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      const snapshots = await getDocs(collection(firebaseClient.db, "companies"));
      const next = snapshots.docs.map((item) => ({ ...item.data(), id: item.id }) as Company);
      setCompanies(next);
      const pairs = await Promise.all(
        next.map(async (company) => {
          const snapshot = await getDoc(
            doc(firebaseClient.db, "communicationEntitlements", company.id),
          );
          return [
            company.id,
            snapshot.exists()
              ? ({ ...snapshot.data(), id: snapshot.id } as CommunicationEntitlement)
              : blank(company.id),
          ] as const;
        }),
      );
      setItems(Object.fromEntries(pairs));
    })();
  }, [allowed]);

  if (loading)
    return (
      <main className="state-page">
        <span className="spinner" />
        <h1>Loading Administration</h1>
      </main>
    );
  if (!user || !allowed)
    return (
      <main className="state-page">
        <div className="state-card">
          <h1>Super Admin Access Required</h1>
          <p className="muted">
            This area is restricted to the Digital Viyabari platform administrator.
          </p>
        </div>
      </main>
    );

  function patch(companyId: string, values: Partial<CommunicationEntitlement>) {
    setItems((current) => ({
      ...current,
      [companyId]: { ...(current[companyId] ?? blank(companyId)), ...values },
    }));
  }
  function patchCredential(companyId: string, values: Partial<Secrets>) {
    setCredentials((current) => ({
      ...current,
      [companyId]: { ...(current[companyId] ?? emptySecrets()), ...values },
    }));
  }

  async function save(companyId: string) {
    const value = items[companyId];
    if (!value || !user) return;
    setSaving(companyId);
    setMessage("");
    try {
      const ref = doc(firebaseClient.db, "communicationEntitlements", companyId),
        existing = await getDoc(ref),
        now = serverTimestamp();
      await setDoc(
        ref,
        {
          ...value,
          companyId,
          updatedAt: now,
          updatedBy: user.uid,
          ...(!existing.exists() ? { createdAt: now, createdBy: user.uid } : {}),
        },
        { merge: true },
      );
      setMessage("Communication entitlement saved securely.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save configuration.");
    } finally {
      setSaving(null);
    }
  }

  async function configure(companyId: string, channel: "sms" | "whatsapp") {
    if (!user) return;
    const values = credentials[companyId] ?? emptySecrets(),
      authKey = channel === "sms" ? values.sms : values.whatsapp;
    if (!authKey) {
      setMessage(`Enter the ${channel.toUpperCase()} MSG91 authentication key.`);
      return;
    }
    if (channel === "whatsapp" && !values.integratedNumber) {
      setMessage("Enter the integrated WhatsApp number.");
      return;
    }
    setSaving(`${companyId}_${channel}`);
    setMessage("");
    try {
      const [idToken, appCheckToken] = await Promise.all([
        user.getIdToken(),
        getFirebaseAppCheckToken(),
      ]);
      const response = await fetch("/api/v1/communications/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
          "x-firebase-appcheck": appCheckToken,
        },
        body: JSON.stringify({
          companyId,
          channel,
          authKey,
          ...(channel === "whatsapp" ? { integratedNumber: values.integratedNumber } : {}),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Credential configuration failed.");
      patch(
        companyId,
        channel === "sms"
          ? { smsCredentialConfigured: true }
          : { whatsappCredentialConfigured: true },
      );
      patchCredential(
        companyId,
        channel === "sms" ? { sms: "" } : { whatsapp: "", integratedNumber: "" },
      );
      setMessage(
        `${channel.toUpperCase()} credentials were encrypted and saved by the VPS service.`,
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to configure credentials.");
    } finally {
      setSaving(null);
    }
  }

  const visibleCompanies = companies.filter(
    (company) => selectedCompany === "all" || company.id === selectedCompany,
  );
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <span className="heading-kicker">Digital Viyabari Platform</span>
          <h1>Communication Add-Ons</h1>
          <p>Configure each company separately.</p>
        </div>
        <div className="admin-header-links">
          <a href="/admin">Return To Admin</a>
          <a href="/dashboard">Workspace</a>
        </div>
      </header>
      {message ? <div className="alert admin-message">{message}</div> : null}
      <section className="communications-company-filter">
        <label>
          Company
          <select
            value={selectedCompany}
            onChange={(event) => setSelectedCompany(event.target.value)}
          >
            <option value="all">All Companies ({companies.length})</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <p>Every card below has its own channels, rates, credentials and credit balance.</p>
      </section>
      <section className="admin-company-list">
        {visibleCompanies.map((company) => {
          const item = items[company.id] ?? blank(company.id),
            secret = credentials[company.id] ?? emptySecrets();
          return (
            <article key={company.id} className="admin-company-card">
              <div className="admin-company-title">
                <div>
                  <span>Company</span>
                  <h2>{company.name}</h2>
                </div>
                <span
                  className={`source-chip ${item.status === "active" ? "source-chip--company" : "source-chip--default"}`}
                >
                  {item.status}
                </span>
              </div>
              <div className="channel-grid">
                <Channel
                  title="Push Notification"
                  enabled={item.pushEnabled}
                  free
                  onChange={(value) => patch(company.id, { pushEnabled: value })}
                />
                <Channel
                  title="Email"
                  enabled={item.emailEnabled}
                  free
                  onChange={(value) => patch(company.id, { emailEnabled: value })}
                />
                <Channel
                  title="WhatsApp"
                  enabled={item.whatsappEnabled}
                  onChange={(value) => patch(company.id, { whatsappEnabled: value })}
                />
                <Channel
                  title="SMS"
                  enabled={item.smsEnabled}
                  onChange={(value) => patch(company.id, { smsEnabled: value })}
                />
              </div>
              <div className="credit-grid">
                <NumberField
                  label="WhatsApp Unit Rate (₹)"
                  value={item.whatsappUnitRate}
                  onChange={(value) => patch(company.id, { whatsappUnitRate: value })}
                />
                <NumberField
                  label="WhatsApp Credits"
                  value={item.whatsappCredits}
                  onChange={(value) => patch(company.id, { whatsappCredits: value })}
                />
                <NumberField
                  label="SMS Unit Rate (₹)"
                  value={item.smsUnitRate}
                  onChange={(value) => patch(company.id, { smsUnitRate: value })}
                />
                <NumberField
                  label="SMS Credits"
                  value={item.smsCredits}
                  onChange={(value) => patch(company.id, { smsCredits: value })}
                />
              </div>
              <div className="credential-panel">
                <div className="credential-note">
                  <strong>Encrypted VPS Credentials</strong>
                  <span>
                    Keys travel directly to the authenticated API and can never be read back.
                  </span>
                </div>
                <div className="credential-grid">
                  <label>
                    SMS Auth Key
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={secret.sms}
                      placeholder={
                        item.smsCredentialConfigured
                          ? "Configured — enter only to replace"
                          : "Enter MSG91 auth key"
                      }
                      onChange={(event) => patchCredential(company.id, { sms: event.target.value })}
                    />
                  </label>
                  <button
                    className="dv-button secondary"
                    disabled={saving === `${company.id}_sms`}
                    onClick={() => void configure(company.id, "sms")}
                  >
                    {saving === `${company.id}_sms`
                      ? "Encrypting…"
                      : item.smsCredentialConfigured
                        ? "Replace SMS Key"
                        : "Configure SMS"}
                  </button>
                  <label>
                    WhatsApp Auth Key
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={secret.whatsapp}
                      placeholder={
                        item.whatsappCredentialConfigured
                          ? "Configured — enter only to replace"
                          : "Enter MSG91 auth key"
                      }
                      onChange={(event) =>
                        patchCredential(company.id, { whatsapp: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Integrated WhatsApp Number
                    <input
                      value={secret.integratedNumber}
                      inputMode="numeric"
                      placeholder="91XXXXXXXXXX"
                      onChange={(event) =>
                        patchCredential(company.id, {
                          integratedNumber: event.target.value.replace(/\D/g, ""),
                        })
                      }
                    />
                  </label>
                  <button
                    className="dv-button secondary"
                    disabled={saving === `${company.id}_whatsapp`}
                    onClick={() => void configure(company.id, "whatsapp")}
                  >
                    {saving === `${company.id}_whatsapp`
                      ? "Encrypting…"
                      : item.whatsappCredentialConfigured
                        ? "Replace WhatsApp Key"
                        : "Configure WhatsApp"}
                  </button>
                </div>
              </div>
              <button
                className="dv-button admin-save"
                disabled={saving === company.id}
                onClick={() => void save(company.id)}
              >
                {saving === company.id ? "Saving…" : "Save Allocation"}
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function Channel({
  title,
  enabled,
  free = false,
  onChange,
}: {
  title: string;
  enabled: boolean;
  free?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="channel-toggle">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>{title}</strong>
        <small>{free ? "Default Channel" : "Paid Add-On"}</small>
      </span>
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
