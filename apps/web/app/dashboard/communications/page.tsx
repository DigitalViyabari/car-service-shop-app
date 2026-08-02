"use client";

import type { CommunicationEntitlement, CommunicationLedgerEntry } from "@dvcs/types";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { firebaseClient } from "@/lib/firebase-client";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function asDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function")
    return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export default function CommunicationsPage() {
  const { user, memberships, activeCompanyId } = useAuth();
  const [entitlement, setEntitlement] = useState<CommunicationEntitlement | null>(null);
  const [entries, setEntries] = useState<CommunicationLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const membership = memberships.find(({ companyId }) => companyId === activeCompanyId);
  const isOwner = membership?.companyRoles.includes("company_owner") ?? false;

  useEffect(() => {
    if (!user || !activeCompanyId || !isOwner) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const [entitlementSnapshot, ledgerSnapshot] = await Promise.all([
          getDoc(doc(firebaseClient.db, "communicationEntitlements", activeCompanyId)),
          getDocs(
            query(
              collection(firebaseClient.db, "communicationLedger"),
              where("companyId", "==", activeCompanyId),
            ),
          ),
        ]);
        if (!active) return;
        setEntitlement(
          entitlementSnapshot.exists()
            ? ({
                ...entitlementSnapshot.data(),
                id: entitlementSnapshot.id,
              } as CommunicationEntitlement)
            : null,
        );
        setEntries(
          ledgerSnapshot.docs.map(
            (item) => ({ ...item.data(), id: item.id }) as CommunicationLedgerEntry,
          ),
        );
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Unable to load communication balances.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeCompanyId, isOwner, user]);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) => (asDate(b.createdAt)?.getTime() ?? 0) - (asDate(a.createdAt)?.getTime() ?? 0),
      ),
    [entries],
  );
  if (!isOwner)
    return (
      <main className="module-page">
        <section className="empty-state">
          <h1>Owner Access Required</h1>
          <p>Owner-only communication settings.</p>
        </section>
      </main>
    );
  if (loading)
    return (
      <main className="module-page">
        <section className="empty-state">
          <h1>Loading</h1>
          <p>Checking balances…</p>
        </section>
      </main>
    );

  return (
    <main className="module-page communications-page">
      <header className="module-header">
        <div>
          <span className="heading-kicker">Owner Control</span>
          <h1>Communications</h1>
          <p>Credits and message usage.</p>
        </div>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      {!entitlement ? (
        <section className="communications-empty">
          <span>Paid Add-Ons</span>
          <h2>WhatsApp and SMS are off</h2>
          <p>Contact Digital Viyabari to activate.</p>
        </section>
      ) : (
        <>
          <section className="communications-summary">
            <ChannelCard
              name="WhatsApp"
              enabled={entitlement.whatsappEnabled}
              credits={entitlement.whatsappCredits}
              rate={entitlement.whatsappUnitRate}
              lowAt={entitlement.whatsappLowBalanceAt}
            />
            <ChannelCard
              name="SMS"
              enabled={entitlement.smsEnabled}
              credits={entitlement.smsCredits}
              rate={entitlement.smsUnitRate}
              lowAt={entitlement.smsLowBalanceAt}
            />
          </section>
          <section className="channel-status-row">
            <span>
              Email <strong>{entitlement.emailEnabled ? "Enabled" : "Disabled"}</strong>
            </span>
            <span>
              Push Notification <strong>{entitlement.pushEnabled ? "Enabled" : "Disabled"}</strong>
            </span>
            <span>
              Provider <strong>Managed By Digital Viyabari</strong>
            </span>
          </section>
          <section className="ledger-panel">
            <div className="ledger-heading">
              <div>
                <span className="heading-kicker">Account Activity</span>
                <h2>Usage History</h2>
              </div>
              <small>{sortedEntries.length} Transactions</small>
            </div>
            {sortedEntries.length === 0 ? (
              <div className="ledger-empty">No paid communication transactions yet.</div>
            ) : (
              <div className="ledger-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Channel</th>
                      <th>Activity</th>
                      <th>Description</th>
                      <th>Units</th>
                      <th>Amount</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEntries.map((entry) => {
                      const date = asDate(entry.createdAt);
                      return (
                        <tr key={entry.id}>
                          <td>{date ? dateTime.format(date) : "—"}</td>
                          <td>
                            <span className={`channel-pill channel-pill--${entry.channel}`}>
                              {entry.channel === "sms" ? "SMS" : "WhatsApp"}
                            </span>
                          </td>
                          <td className="capitalize">{entry.type}</td>
                          <td>{entry.description}</td>
                          <td>{entry.units}</td>
                          <td>{money.format(entry.amount)}</td>
                          <td>{entry.balanceAfter}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function ChannelCard({
  name,
  enabled,
  credits,
  rate,
  lowAt,
}: {
  name: string;
  enabled: boolean;
  credits: number;
  rate: number;
  lowAt: number;
}) {
  const low = enabled && credits <= lowAt;
  return (
    <article className={`communication-card ${low ? "communication-card--low" : ""}`}>
      <div className="communication-card-top">
        <span className="channel-symbol">{name === "SMS" ? "SMS" : "WA"}</span>
        <span
          className={`source-chip ${enabled ? "source-chip--company" : "source-chip--default"}`}
        >
          {enabled ? "Active" : "Not Active"}
        </span>
      </div>
      <p>{name} Credits</p>
      <strong className="credit-number">{credits.toLocaleString("en-IN")}</strong>
      <div className="communication-meta">
        <span>
          Unit Rate <strong>{money.format(rate)}</strong>
        </span>
        <span>
          Low Balance At <strong>{lowAt.toLocaleString("en-IN")}</strong>
        </span>
      </div>
      {low ? (
        <div className="low-credit-warning">
          Low balance — contact Digital Viyabari for recharge.
        </div>
      ) : null}
    </article>
  );
}
