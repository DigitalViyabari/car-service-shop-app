import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { callableRequestSchema } from "@dvcs/validation";

initializeApp();
const db = getFirestore();
const credentialMasterKey = defineSecret("COMMUNICATION_CREDENTIAL_MASTER_KEY");
const region = "asia-south1";

const channelSchema = z.enum(["sms", "whatsapp"]);
const configureCredentialSchema = z.object({
  companyId: z.string().min(2).max(128),
  channel: channelSchema,
  authKey: z.string().min(16).max(512),
  integratedNumber: z.string().regex(/^\d{10,15}$/).optional(),
});
const sendSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  channel: channelSchema,
  recipient: z.string().regex(/^\d{10,15}$/),
  templateId: z.string().min(2).max(180),
  languageCode: z.string().min(2).max(12).default("en"),
  variables: z.record(z.string(), z.string().max(500)).default({}),
  idempotencyKey: z.string().min(12).max(160),
  description: z.string().min(2).max(240),
});

type EncryptedValue = { ciphertext: string; iv: string; tag: string };
type CredentialRecord = { authKey: EncryptedValue; integratedNumber?: EncryptedValue; provider: "msg91" };

function masterKey(): Buffer {
  const value = Buffer.from(credentialMasterKey.value(), "base64");
  if (value.length !== 32) throw new HttpsError("failed-precondition", "Communication encryption is not configured.");
  return value;
}
function encrypt(value: string): EncryptedValue {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
function decrypt(value: EncryptedValue): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
async function isPlatformSuperAdmin(uid: string): Promise<boolean> {
  const profile = await db.doc(`users/${uid}`).get();
  return profile.exists && (profile.get("platformRoles") as unknown[] | undefined)?.includes("platform_super_admin") === true;
}
async function assertCompanySender(uid: string, companyId: string, branchId: string): Promise<void> {
  const membership = await db.doc(`memberships/${uid}_${companyId}`).get();
  if (!membership.exists || membership.get("status") !== "active") throw new HttpsError("permission-denied", "No active company membership.");
  const companyRoles = (membership.get("companyRoles") as string[] | undefined) ?? [];
  const assignments = (membership.get("branchAssignments") as { branchId?: string; roles?: string[] }[] | undefined) ?? [];
  const allowedCompanyRole = companyRoles.some((role) => ["company_owner", "company_admin"].includes(role));
  const allowedBranchRole = assignments.some((item) => item.branchId === branchId && item.roles?.some((role) => ["branch_manager", "service_advisor", "receptionist"].includes(role)));
  if (!allowedCompanyRole && !allowedBranchRole) throw new HttpsError("permission-denied", "Messaging permission is required.");
}

export const configureCommunicationCredential = onCall(
  { enforceAppCheck: true, region, secrets: [credentialMasterKey] },
  async (request) => {
    if (!request.auth || !(await isPlatformSuperAdmin(request.auth.uid))) throw new HttpsError("permission-denied", "Platform Super Admin access is required.");
    const parsed = configureCredentialSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid credential configuration.");
    const { companyId, channel, authKey, integratedNumber } = parsed.data;
    if (channel === "whatsapp" && !integratedNumber) throw new HttpsError("invalid-argument", "WhatsApp integrated number is required.");
    const credential: CredentialRecord = { provider: "msg91", authKey: encrypt(authKey), ...(integratedNumber ? { integratedNumber: encrypt(integratedNumber) } : {}) };
    await Promise.all([
      db.doc(`communicationCredentials/${companyId}_${channel}`).set({ ...credential, companyId, channel, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true }),
      db.doc(`communicationEntitlements/${companyId}`).set({ [`${channel}CredentialConfigured`]: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true }),
    ]);
    return { configured: true, companyId, channel };
  },
);

export const sendPaidCommunication = onCall(
  { enforceAppCheck: true, region, secrets: [credentialMasterKey], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const parsed = sendSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid communication request.");
    const input = parsed.data;
    await assertCompanySender(request.auth.uid, input.companyId, input.branchId);
    const credentialSnapshot = await db.doc(`communicationCredentials/${input.companyId}_${input.channel}`).get();
    if (!credentialSnapshot.exists) throw new HttpsError("failed-precondition", `${input.channel.toUpperCase()} credentials are not configured.`);
    const ledgerRef = db.doc(`communicationLedger/${input.companyId}_${input.idempotencyKey}`);
    const entitlementRef = db.doc(`communicationEntitlements/${input.companyId}`);
    const reservation = await db.runTransaction(async (transaction) => {
      const [existing, entitlement] = await Promise.all([transaction.get(ledgerRef), transaction.get(entitlementRef)]);
      if (existing.exists) return { duplicate: true, status: existing.get("status") as string };
      if (!entitlement.exists || entitlement.get("status") !== "active" || entitlement.get(`${input.channel}Enabled`) !== true) throw new HttpsError("failed-precondition", `${input.channel.toUpperCase()} is not enabled.`);
      const creditsField = `${input.channel}Credits`; const rateField = `${input.channel}UnitRate`;
      const credits = Number(entitlement.get(creditsField) ?? 0); const rate = Number(entitlement.get(rateField) ?? 0);
      if (credits < 1) throw new HttpsError("resource-exhausted", `${input.channel.toUpperCase()} credits are exhausted.`);
      transaction.update(entitlementRef, { [creditsField]: credits - 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid });
      transaction.create(ledgerRef, { companyId: input.companyId, branchId: input.branchId, channel: input.channel, type: "usage", units: 1, amount: rate, balanceAfter: credits - 1, description: input.description, referenceId: input.idempotencyKey, recipientMasked: `******${input.recipient.slice(-4)}`, status: "pending", createdAt: FieldValue.serverTimestamp(), createdBy: request.auth!.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid });
      return { duplicate: false, status: "pending", rate };
    });
    if (reservation.duplicate) return { duplicate: true, status: reservation.status };
    const credential = credentialSnapshot.data() as CredentialRecord;
    let providerResult: Awaited<ReturnType<typeof sendMsg91>>;
    try {
      providerResult = await sendMsg91(input, decrypt(credential.authKey), credential.integratedNumber ? decrypt(credential.integratedNumber) : undefined);
    } catch (reason) {
      await db.runTransaction(async (transaction) => {
        const [ledger, entitlement] = await Promise.all([transaction.get(ledgerRef), transaction.get(entitlementRef)]);
        if (!ledger.exists || ledger.get("status") !== "pending" || !entitlement.exists) return;
        const creditsField = `${input.channel}Credits`; const credits = Number(entitlement.get(creditsField) ?? 0);
        transaction.update(entitlementRef, { [creditsField]: credits + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: "system_refund" });
        transaction.update(ledgerRef, { status: "failed", failureReason: reason instanceof Error ? reason.message.slice(0, 300) : "Provider rejected the request.", updatedAt: FieldValue.serverTimestamp(), updatedBy: "system_refund" });
        transaction.create(db.collection("communicationLedger").doc(), { companyId: input.companyId, branchId: input.branchId, channel: input.channel, type: "refund", units: 1, amount: reservation.rate ?? 0, balanceAfter: credits + 1, description: `Automatic refund: ${input.description}`, referenceId: input.idempotencyKey, status: "completed", createdAt: FieldValue.serverTimestamp(), createdBy: "system_refund", updatedAt: FieldValue.serverTimestamp(), updatedBy: "system_refund" });
      });
      throw new HttpsError("unavailable", "The provider could not send this message. The credit was refunded.");
    }
    await ledgerRef.update({ status: "completed", providerMessageId: providerResult.messageId, providerResponse: providerResult.summary, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
    return { duplicate: false, status: "completed", referenceId: input.idempotencyKey };
  },
);

async function sendMsg91(input: z.infer<typeof sendSchema>, authKey: string, integratedNumber?: string): Promise<{ messageId: string; summary: string }> {
  const sms = input.channel === "sms";
  const url = sms ? "https://control.msg91.com/api/v5/flow" : "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
  const body = sms
    ? { template_id: input.templateId, short_url: "0", realTimeResponse: "1", recipients: [{ mobiles: input.recipient, ...input.variables }] }
    : { integrated_number: integratedNumber, content_type: "template", payload: { to_and_components: [{ to: [input.recipient], components: input.variables }], template: { name: input.templateId, language: { code: input.languageCode, policy: "deterministic" } } } };
  const response = await fetch(url, { method: "POST", headers: { accept: "application/json", authkey: authKey, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`MSG91 ${response.status}: ${text.slice(0, 180)}`);
  let result: Record<string, unknown> = {}; try { result = JSON.parse(text) as Record<string, unknown>; } catch { result = { response: text }; }
  const messageId = String(result.request_id ?? result.message_id ?? result.id ?? "accepted");
  return { messageId, summary: JSON.stringify(result).slice(0, 600) };
}

export const branchAccessHealth = onCall(
  { enforceAppCheck: true, region },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const parsed = callableRequestSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid branch context.");
    const { companyId, branchId } = parsed.data;
    const [membership, subscription] = await Promise.all([
      db.doc(`memberships/${request.auth.uid}_${companyId}`).get(),
      db.doc(`branchSubscriptions/${branchId}`).get(),
    ]);
    if (!membership.exists || membership.get("status") !== "active") throw new HttpsError("permission-denied", "No active company membership.");
    const companyRoles = membership.get("companyRoles") as unknown[] | undefined;
    const branchAssignments = membership.get("branchAssignments") as { branchId?: string }[] | undefined;
    if (!companyRoles?.length && !branchAssignments?.some((item) => item.branchId === branchId)) throw new HttpsError("permission-denied", "Branch assignment is required.");
    if (!subscription.exists || subscription.get("companyId") !== companyId) throw new HttpsError("failed-precondition", "Branch subscription is unavailable.");
    return { branchId, subscriptionStatus: subscription.get("status") as string, checkedAt: Timestamp.now().toDate().toISOString() };
  },
);
