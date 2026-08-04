import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import { z } from "zod";

if (!getApps().length) {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  initializeApp({
    credential: credentialPath ? cert(credentialPath) : applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}
const app = getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const port = Number(process.env.PORT ?? 3200);
const channels = z.enum(["sms", "whatsapp"]);
const configureSchema = z.object({
  companyId: z.string().min(2).max(128),
  channel: channels,
  authKey: z.string().min(16).max(512),
  integratedNumber: z
    .string()
    .regex(/^\d{10,15}$/)
    .optional(),
});
const testEmailSchema = z.object({ recipient: z.email() });
const sendSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  channel: channels,
  recipient: z.string().regex(/^\d{10,15}$/),
  templateId: z.string().min(2).max(180),
  languageCode: z.string().min(2).max(12).default("en"),
  variables: z.record(z.string(), z.string().max(500)).default({}),
  idempotencyKey: z.string().min(12).max(160),
  description: z.string().min(2).max(240),
});
const branchRoles = z.enum([
  "branch_manager",
  "finance_manager",
  "job_creator",
  "inventory_manager",
  "technician",
]);
const assignmentSchema = z.object({
  companyId: z.string().min(2).max(128),
  userId: z.string().min(8).max(128),
  branchId: z.string().min(2).max(128),
  roles: z.array(branchRoles).min(1).max(4),
});
const createStaffSchema = z.object({
  companyId: z.string().min(2),
  branchId: z.string().min(2),
  displayName: z.string().min(2).max(100),
  email: z.email(),
  temporaryPassword: z.string().min(8).max(128),
  role: branchRoles,
});
const staffStatusSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  userId: z.string().min(8).max(128),
  action: z.enum(["enable", "disable", "delete"]),
});
const reversePaymentSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  paymentId: z.string().min(8).max(128),
  reason: z.string().min(3).max(300),
});
const correctPaymentSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  paymentId: z.string().min(8).max(128),
  amount: z.number().positive().max(100000000),
  method: z.enum(["cash", "upi", "card", "bank_transfer", "cheque", "other"]),
  reference: z.string().max(200).default(""),
  notes: z.string().max(500).default(""),
  reason: z.string().min(3).max(300),
});
const recordPaymentSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  invoiceId: z.string().min(2).max(128),
  amount: z.number().positive().max(100000000),
  method: z.enum(["cash", "upi", "card", "bank_transfer", "cheque", "other"]),
  reference: z.string().max(200).default(""),
  notes: z.string().max(500).default(""),
});
const supplierPaymentSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  purchaseId: z.string().min(8).max(128),
  amount: z.number().positive().max(100000000),
  method: z.enum(["cash", "upi", "card", "bank_transfer", "cheque", "other"]),
  reference: z.string().max(200).default(""),
  notes: z.string().max(500).default(""),
});
const notificationSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  jobId: z.string().min(2).max(128),
  type: z.enum(["job_assigned", "delay_reported"]),
  recipientUserId: z.string().min(8).max(128).optional(),
  message: z.string().min(3).max(300),
});
const notificationReadSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  notificationId: z.string().min(2).max(128),
});
const paymentFollowUpSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  invoiceId: z.string().min(2).max(128),
});
const businessSettingsSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  gstSetup: z.enum(["unregistered", "existing", "new"]),
  profile: z.object({
    gstRegistrationId: z.string().max(180).optional().default(""),
    legalName: z.string().min(2).max(180),
    tradeName: z.string().min(2).max(180),
    gstin: z.string().max(15).optional().default(""),
    pan: z.string().max(10).optional().default(""),
    registrationType: z.enum(["regular", "composition", "unregistered"]),
    addressLine1: z.string().min(2).max(240),
    addressLine2: z.string().max(240).optional().default(""),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(100),
    stateCode: z.string().min(2).max(2),
    postalCode: z.string().min(4).max(10),
    branchAddressName: z.string().max(180).optional().default(""),
    registeredAddressLine1: z.string().max(240).optional().default(""),
    registeredAddressLine2: z.string().max(240).optional().default(""),
    registeredCity: z.string().max(100).optional().default(""),
    registeredPostalCode: z.string().max(10).optional().default(""),
    invoiceAddressMode: z.enum(["branch", "registered"]).default("branch"),
    invoiceSeriesMode: z.enum(["shared", "branch"]).default("shared"),
    invoiceSeriesId: z.string().max(180).optional().default("shared"),
    invoicePrefix: z.string().min(1).max(4),
    invoiceStartNumber: z.number().int().min(1).max(999999),
    invoiceTerms: z.string().max(2000).optional().default(""),
    authorizedSignatory: z.string().max(180).optional().default(""),
    phone: z.string().max(30).optional().default(""),
    email: z.string().max(180).optional().default(""),
    bankName: z.string().max(180).optional().default(""),
    accountName: z.string().max(180).optional().default(""),
    accountNumber: z.string().max(60).optional().default(""),
    ifscCode: z.string().max(20).optional().default(""),
    upiId: z.string().max(180).optional().default(""),
    invoiceLogoUrl: z.string().max(1000).optional().default(""),
    invoiceAccentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    invoicePaperSize: z.enum(["A4", "A5"]),
  }),
});
const createPlatformAdminSchema = z.object({
  displayName: z.string().min(2).max(100),
  email: z.email(),
  temporaryPassword: z.string().min(8).max(128),
});
const impersonationSchema = z.object({ targetUserId: z.string().min(8).max(128) });
const resetAccountPasswordSchema = z.object({
  targetUserId: z.string().min(8).max(128),
  temporaryPassword: z.string().min(8).max(128),
});
const invoiceLineInputSchema = z.object({
  type: z.enum(["labour", "product"]),
  productId: z.string().max(128).nullable().optional(),
  description: z.string().min(1).max(300),
  quantity: z.number().positive().max(100000),
  unit: z.string().min(1).max(20),
  unitPrice: z.number().nonnegative().max(100000000),
  discount: z.number().nonnegative().max(100000000).default(0),
  gstRate: z.number().min(0).max(100),
});
const invoicePaymentInputSchema = z.object({
  status: z.enum(["unpaid", "part_paid", "full_paid"]).default("unpaid"),
  amount: z.number().nonnegative().max(100000000).default(0),
  method: z.enum(["cash", "upi", "card", "bank_transfer", "cheque", "other"]).default("cash"),
  reference: z.string().max(200).default(""),
  notes: z.string().max(500).default(""),
});
const issueInvoiceSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  sourceType: z.enum(["job", "counter_sale"]).default("job"),
  jobId: z.string().max(128).optional(),
  customerId: z.string().max(128).optional(),
  customerName: z.string().min(2).max(160).optional(),
  dueAt: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).default(""),
  lines: z.array(invoiceLineInputSchema).min(1).max(100).optional(),
  payment: invoicePaymentInputSchema.optional(),
});
const amendInvoiceSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  invoiceId: z.string().min(2).max(128),
  reason: z.string().min(3).max(500),
  dueAt: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).default(""),
  lines: z.array(invoiceLineInputSchema).min(1).max(100),
  payment: invoicePaymentInputSchema.optional(),
});
const createJobSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  customerId: z.string().min(2).max(128),
  vehicleId: z.string().min(2).max(128),
  serviceType: z.string().min(2).max(100),
  priority: z.enum(["normal", "urgent", "breakdown"]),
  odometer: z.number().nonnegative().nullable(),
  fuelLevel: z.number().min(0).max(100).nullable(),
  complaints: z.array(z.string().min(1).max(500)).min(1).max(20),
  internalNotes: z.string().max(2000),
  promisedAt: z.string().max(40).nullable(),
});
const jobStatusSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  jobId: z.string().min(2).max(128),
  status: z.enum([
    "check_in",
    "inspection",
    "estimate_pending",
    "approved",
    "in_progress",
    "quality_check",
    "ready",
    "delivered",
    "cancelled",
  ]),
  qualityNotes: z.string().max(1000).default(""),
  cancellationReason: z.string().max(500).default(""),
  deliveryNotes: z.string().max(1000).default(""),
  nextServiceDueAt: z.string().max(40).nullable().optional(),
  nextServiceDueKm: z.number().nonnegative().nullable().optional(),
  assignedTechnicianId: z.string().min(8).max(128).optional(),
});
const jobRevisionSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  jobId: z.string().min(2).max(128),
  reason: z.string().min(3).max(500),
});
const estimateEmailSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  jobId: z.string().min(2).max(128),
});
const createCompanySchema = z.object({
  companyName: z.string().min(2).max(120),
  branchName: z.string().min(2).max(120).default("Main Branch"),
  ownerName: z.string().min(2).max(100),
  ownerEmail: z.email(),
  temporaryPassword: z.string().min(8).max(128),
  billingCycle: z.enum(["monthly", "yearly"]),
  trialDays: z.number().int().min(0).max(365).default(30),
});
const updateSubscriptionSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128).optional(),
  plan: z.enum(["trial", "monthly", "yearly"]),
  trialDays: z.number().int().min(1).max(365).default(30),
});
const createBranchSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchName: z.string().min(2).max(120),
  plan: z.enum(["trial", "monthly", "yearly"]),
  trialDays: z.number().int().min(1).max(365).default(30),
});
const branchAccessSchema = z.object({
  companyId: z.string().min(2).max(128),
  branchId: z.string().min(2).max(128),
  action: z.enum(["activate", "suspend"]),
});
type Encrypted = { ciphertext: string; iv: string; tag: string };
type Credential = { authKey: Encrypted; integratedNumber?: Encrypted; provider: "msg91" };
type RateWindow = { count: number; resetAt: number };

const rateWindows = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60_000;

function enforceRateLimit(key: string, limit: number) {
  const now = Date.now(),
    existing = rateWindows.get(key);
  if (!existing || existing.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (existing.count >= limit) throw new ApiError(429, "Too many requests. Try again shortly.");
  existing.count += 1;
}

function key() {
  const value = Buffer.from(process.env.COMMUNICATION_CREDENTIAL_MASTER_KEY ?? "", "base64");
  if (value.length !== 32) throw new ApiError(503, "Encryption is not configured.");
  return value;
}
function encrypt(value: string): Encrypted {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv),
    ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
function decrypt(value: Encrypted) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function reply(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage) {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of request) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > 64_000) throw new ApiError(413, "Request is too large.");
    parts.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid JSON body.");
  }
}
async function identity(request: IncomingMessage): Promise<DecodedIdToken> {
  const bearer = request.headers.authorization;
  if (!bearer?.startsWith("Bearer ")) throw new ApiError(401, "Authentication is required.");
  if (process.env.REQUIRE_APP_CHECK === "true") {
    const token = request.headers["x-firebase-appcheck"];
    if (typeof token !== "string") throw new ApiError(401, "App Check is required.");
    try {
      await getAppCheck(app).verifyToken(token);
    } catch {
      throw new ApiError(401, "Invalid App Check token.");
    }
  }
  try {
    return await auth.verifyIdToken(bearer.slice(7), true);
  } catch {
    throw new ApiError(401, "Invalid authentication token.");
  }
}
async function superAdmin(uid: string) {
  const profile = await db.doc(`users/${uid}`).get();
  return (
    profile.exists &&
    ((profile.get("platformRoles") as unknown[] | undefined)?.includes("platform_super_admin") ??
      false)
  );
}
async function platformAdministrator(uid: string) {
  const profile = await db.doc(`users/${uid}`).get(),
    roles = (profile.get("platformRoles") as string[] | undefined) ?? [];
  return (
    profile.exists &&
    roles.some((role) => ["platform_super_admin", "platform_support_admin"].includes(role))
  );
}
async function platformOverview(user: DecodedIdToken) {
  if (!(await platformAdministrator(user.uid)))
    throw new ApiError(403, "Platform Admin access is required.");
  const administratorProfile = await db.doc(`users/${user.uid}`).get(),
    platformRoles = (administratorProfile.get("platformRoles") as string[] | undefined) ?? [],
    exposeFinancials = platformRoles.includes("platform_super_admin");
  const [companies, branches, memberships, subscriptions, invoices, users] = await Promise.all([
      db.collection("companies").get(),
      db.collection("branches").get(),
      db.collection("memberships").get(),
      db.collection("branchSubscriptions").get(),
      exposeFinancials ? db.collection("invoices").get() : Promise.resolve(null),
      db.collection("users").get(),
    ]),
    profiles = new Map(users.docs.map((item) => [item.id, item.data()])),
    companyItems = companies.docs.map((company) => {
      const companyId = company.id,
        companySubscriptions = subscriptions.docs.filter(
          (item) => item.get("companyId") === companyId,
        ),
        primarySubscription = companySubscriptions[0],
        companyInvoices =
          invoices?.docs.filter((item) => item.get("companyId") === companyId) ?? [],
        companyMembers = memberships.docs.filter((item) => item.get("companyId") === companyId),
        owners = companyMembers
          .filter((item) =>
            ((item.get("companyRoles") as string[] | undefined) ?? []).includes("company_owner"),
          )
          .map((item) => {
            const profile = profiles.get(String(item.get("userId"))) ?? {};
            return {
              userId: item.get("userId"),
              displayName: profile.displayName ?? "Owner",
              email: profile.email ?? "",
            };
          });
      return {
        id: companyId,
        name: company.get("name") ?? "Business",
        status: company.get("status") ?? "active",
        ...(exposeFinancials
          ? {
              turnover: companyInvoices.reduce(
                (sum, item) => sum + Number(item.get("totalAmount") ?? 0),
                0,
              ),
              collected: companyInvoices.reduce(
                (sum, item) => sum + Number(item.get("paidAmount") ?? 0),
                0,
              ),
              invoiceCount: companyInvoices.length,
            }
          : {}),
        memberCount: companyMembers.length,
        subscription: primarySubscription
          ? (() => {
              const periodEnd = primarySubscription.get("currentPeriodEnd")?.toDate?.() as
                  Date | undefined,
                storedStatus = String(primarySubscription.get("status") ?? "active"),
                effectiveStatus =
                  periodEnd && periodEnd.getTime() < Date.now() ? "expired" : storedStatus;
              return {
                plan:
                  storedStatus === "trialing"
                    ? "trial"
                    : (primarySubscription.get("billingCycle") ??
                      primarySubscription.get("planId") ??
                      "monthly"),
                status: effectiveStatus,
                currentPeriodEnd: periodEnd?.toISOString() ?? null,
                branchCount: companySubscriptions.length,
              };
            })()
          : null,
        owners,
        branches: branches.docs
          .filter((branch) => branch.get("companyId") === companyId)
          .map((branch) => {
            const subscription = companySubscriptions.find((item) => item.id === branch.id),
              periodEnd = subscription?.get("currentPeriodEnd")?.toDate?.() as Date | undefined;
            return {
              id: branch.id,
              name: branch.get("name") ?? "Branch",
              status: branch.get("status") ?? "active",
              subscription: subscription
                ? {
                    plan:
                      subscription.get("status") === "trialing"
                        ? "trial"
                        : (subscription.get("billingCycle") ?? "monthly"),
                    status:
                      periodEnd && periodEnd.getTime() < Date.now()
                        ? "expired"
                        : subscription.get("status"),
                    currentPeriodEnd: periodEnd?.toISOString() ?? null,
                  }
                : null,
            };
          }),
      };
    }),
    accounts = memberships.docs.map((membership) => {
      const userId = String(membership.get("userId")),
        profile = profiles.get(userId) ?? {};
      return {
        userId,
        companyId: membership.get("companyId"),
        displayName: profile.displayName ?? "Team Member",
        email: profile.email ?? "",
        companyRoles: membership.get("companyRoles") ?? [],
        branchAssignments: membership.get("branchAssignments") ?? [],
        status: membership.get("status") ?? "active",
      };
    });
  return { companies: companyItems, accounts, platformRoles };
}
async function createPlatformAdmin(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await superAdmin(user.uid))) throw new ApiError(403, "Super Admin access is required.");
  const parsed = createPlatformAdminSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid administrator details.");
  const input = parsed.data,
    created = await auth.createUser({
      displayName: input.displayName,
      email: input.email.toLowerCase(),
      password: input.temporaryPassword,
    }),
    now = FieldValue.serverTimestamp();
  await db.doc(`users/${created.uid}`).set({
    displayName: input.displayName,
    email: input.email.toLowerCase(),
    platformRoles: ["platform_support_admin"],
    status: "active",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  return { created: true, userId: created.uid };
}
function companySlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
async function createCompany(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await platformAdministrator(user.uid)))
    throw new ApiError(403, "Platform Admin access is required.");
  const parsed = createCompanySchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid company and owner details.");
  const input = parsed.data,
    suffix = randomBytes(3).toString("hex"),
    companyId = `${companySlug(input.companyName) || "company"}-${suffix}`,
    branchId = `${companyId}-main`,
    nowDate = new Date(),
    periodEnd = new Date(nowDate);
  periodEnd.setDate(
    periodEnd.getDate() +
      (input.trialDays > 0 ? input.trialDays : input.billingCycle === "monthly" ? 30 : 365),
  );
  let owner;
  try {
    owner = await auth.createUser({
      displayName: input.ownerName,
      email: input.ownerEmail.toLowerCase(),
      password: input.temporaryPassword,
    });
  } catch {
    throw new ApiError(409, "This owner email already exists. Use a different email address.");
  }
  const now = FieldValue.serverTimestamp(),
    batch = db.batch();
  batch.create(db.doc(`users/${owner.uid}`), {
    displayName: input.ownerName,
    email: input.ownerEmail.toLowerCase(),
    platformRoles: [],
    status: "active",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  batch.create(db.doc(`companies/${companyId}`), {
    name: input.companyName,
    status: "active",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  batch.create(db.doc(`branches/${branchId}`), {
    companyId,
    name: input.branchName,
    code: "MB",
    status: "active",
    timezone: "Asia/Kolkata",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  batch.create(db.doc(`memberships/${owner.uid}_${companyId}`), {
    userId: owner.uid,
    companyId,
    companyRoles: ["company_owner"],
    branchIds: [branchId],
    branchAssignments: [],
    branchRoleKeys: [],
    status: "active",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  batch.create(db.doc(`branchSubscriptions/${branchId}`), {
    companyId,
    branchId,
    planId: input.billingCycle,
    billingCycle: input.billingCycle,
    status: input.trialDays > 0 ? "trialing" : "active",
    trialDays: input.trialDays,
    currentPeriodStart: Timestamp.fromDate(nowDate),
    currentPeriodEnd: Timestamp.fromDate(periodEnd),
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  try {
    await batch.commit();
  } catch (reason) {
    await auth.deleteUser(owner.uid).catch(() => undefined);
    throw reason;
  }
  return {
    created: true,
    companyId,
    branchId,
    ownerUserId: owner.uid,
    subscriptionStatus: input.trialDays > 0 ? "trialing" : "active",
    currentPeriodEnd: periodEnd.toISOString(),
  };
}
async function updateCompanySubscription(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await platformAdministrator(user.uid)))
    throw new ApiError(403, "Platform Admin access is required.");
  const parsed = updateSubscriptionSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Select a valid subscription plan.");
  const input = parsed.data,
    company = await db.doc(`companies/${input.companyId}`).get();
  if (!company.exists) throw new ApiError(404, "Company not found.");
  const companyBranches = await db
      .collection("branches")
      .where("companyId", "==", input.companyId)
      .get(),
    targetBranches = input.branchId
      ? companyBranches.docs.filter((branch) => branch.id === input.branchId)
      : companyBranches.docs;
  if (!targetBranches.length) throw new ApiError(409, "The selected company branch was not found.");
  const periodStart = new Date(),
    periodEnd = new Date(periodStart);
  if (input.plan === "trial") periodEnd.setDate(periodEnd.getDate() + input.trialDays);
  if (input.plan === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
  if (input.plan === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  const now = FieldValue.serverTimestamp(),
    batch = db.batch(),
    status = input.plan === "trial" ? "trialing" : "active",
    billingCycle = input.plan === "trial" ? "monthly" : input.plan;
  for (const branch of targetBranches) {
    batch.set(
      db.doc(`branchSubscriptions/${branch.id}`),
      {
        companyId: input.companyId,
        branchId: branch.id,
        planId: input.plan,
        billingCycle,
        status,
        trialDays: input.plan === "trial" ? input.trialDays : 0,
        currentPeriodStart: Timestamp.fromDate(periodStart),
        currentPeriodEnd: Timestamp.fromDate(periodEnd),
        updatedAt: now,
        updatedBy: user.uid,
      },
      { merge: true },
    );
  }
  batch.set(db.collection("platformAuditLogs").doc(), {
    action: "company_subscription_updated",
    actorUserId: user.uid,
    companyId: input.companyId,
    plan: input.plan,
    status,
    branchIds: targetBranches.map((branch) => branch.id),
    currentPeriodStart: Timestamp.fromDate(periodStart),
    currentPeriodEnd: Timestamp.fromDate(periodEnd),
    createdAt: now,
  });
  await batch.commit();
  return {
    updated: true,
    companyId: input.companyId,
    plan: input.plan,
    status,
    branchCount: targetBranches.length,
    currentPeriodEnd: periodEnd.toISOString(),
  };
}

async function createCompanyBranch(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await platformAdministrator(user.uid)))
    throw new ApiError(403, "Platform Admin access is required.");
  const parsed = createBranchSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid branch and subscription details.");
  const input = parsed.data,
    company = await db.doc(`companies/${input.companyId}`).get();
  if (!company.exists) throw new ApiError(404, "Company not found.");
  const branchRef = db.collection("branches").doc(),
    periodStart = new Date(),
    periodEnd = new Date(periodStart);
  if (input.plan === "trial") periodEnd.setDate(periodEnd.getDate() + input.trialDays);
  if (input.plan === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
  if (input.plan === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  const now = FieldValue.serverTimestamp(),
    batch = db.batch(),
    status = input.plan === "trial" ? "trialing" : "active";
  batch.create(branchRef, {
    companyId: input.companyId,
    name: input.branchName,
    code: `BR${branchRef.id.slice(0, 4).toUpperCase()}`,
    status: "active",
    timezone: "Asia/Kolkata",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  batch.create(db.doc(`branchSubscriptions/${branchRef.id}`), {
    companyId: input.companyId,
    branchId: branchRef.id,
    planId: input.plan,
    billingCycle: input.plan === "trial" ? "monthly" : input.plan,
    status,
    trialDays: input.plan === "trial" ? input.trialDays : 0,
    currentPeriodStart: Timestamp.fromDate(periodStart),
    currentPeriodEnd: Timestamp.fromDate(periodEnd),
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  batch.create(db.collection("platformAuditLogs").doc(), {
    action: "company_branch_created",
    actorUserId: user.uid,
    companyId: input.companyId,
    branchId: branchRef.id,
    plan: input.plan,
    createdAt: now,
  });
  await batch.commit();
  return {
    created: true,
    branchId: branchRef.id,
    plan: input.plan,
    currentPeriodEnd: periodEnd.toISOString(),
  };
}
async function updateBranchAccess(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await platformAdministrator(user.uid)))
    throw new ApiError(403, "Platform Admin access is required.");
  const parsed = branchAccessSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Select a valid branch action.");
  const input = parsed.data,
    branchRef = db.doc(`branches/${input.branchId}`),
    subscriptionRef = db.doc(`branchSubscriptions/${input.branchId}`),
    [branch, subscription] = await Promise.all([branchRef.get(), subscriptionRef.get()]);
  if (!branch.exists || branch.get("companyId") !== input.companyId)
    throw new ApiError(404, "Branch not found.");
  if (input.action === "activate" && !subscription.exists)
    throw new ApiError(409, "Set a subscription before activating this branch.");
  const periodEnd = subscription.get("currentPeriodEnd")?.toDate?.() as Date | undefined;
  if (input.action === "activate" && periodEnd && periodEnd.getTime() < Date.now())
    throw new ApiError(409, "Renew the branch subscription before activating access.");
  const now = FieldValue.serverTimestamp(),
    batch = db.batch();
  batch.update(branchRef, {
    status: input.action === "suspend" ? "suspended" : "active",
    updatedAt: now,
    updatedBy: user.uid,
  });
  if (subscription.exists)
    batch.update(subscriptionRef, {
      status:
        input.action === "suspend"
          ? "suspended"
          : subscription.get("planId") === "trial" || Number(subscription.get("trialDays") ?? 0) > 0
            ? "trialing"
            : "active",
      updatedAt: now,
      updatedBy: user.uid,
    });
  batch.create(db.collection("platformAuditLogs").doc(), {
    action: input.action === "suspend" ? "branch_suspended" : "branch_activated",
    actorUserId: user.uid,
    companyId: input.companyId,
    branchId: input.branchId,
    createdAt: now,
  });
  await batch.commit();
  return { updated: true, status: input.action === "suspend" ? "suspended" : "active" };
}
async function impersonateAccount(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await superAdmin(user.uid))) throw new ApiError(403, "Super Admin access is required.");
  const parsed = impersonationSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Select a valid account.");
  const target = await auth.getUser(parsed.data.targetUserId),
    now = FieldValue.serverTimestamp();
  const audit = await db.collection("platformAuditLogs").add({
    action: "account_impersonation",
    actorUserId: user.uid,
    targetUserId: target.uid,
    targetEmail: target.email ?? "",
    createdAt: now,
  });
  const token = await auth.createCustomToken(target.uid, {
    impersonatedBy: user.uid,
    impersonationAuditId: audit.id,
  });
  return { token, targetEmail: target.email ?? "" };
}
async function resetAccountPassword(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await superAdmin(user.uid))) throw new ApiError(403, "Super Admin access is required.");
  const parsed = resetAccountPasswordSchema.safeParse(await body(request));
  if (!parsed.success)
    throw new ApiError(400, "Enter a temporary password with at least 8 characters.");
  const target = await auth.getUser(parsed.data.targetUserId);
  await auth.updateUser(target.uid, { password: parsed.data.temporaryPassword });
  await db.collection("platformAuditLogs").add({
    action: "account_password_reset",
    actorUserId: user.uid,
    targetUserId: target.uid,
    targetEmail: target.email ?? "",
    createdAt: FieldValue.serverTimestamp(),
  });
  return { updated: true, targetUserId: target.uid, targetEmail: target.email ?? "" };
}
async function issueInvoice(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = issueInvoiceSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid invoice details.");
  const input = parsed.data;
  await financeManager(user.uid, input.companyId, input.branchId);
  if (input.sourceType === "job" && !input.jobId) throw new ApiError(400, "Select a Ready job.");
  const invoiceRef =
      input.sourceType === "job"
        ? db.doc(`invoices/${input.jobId}`)
        : db.collection("invoices").doc(),
    jobRef = input.jobId ? db.doc(`jobSheets/${input.jobId}`) : null,
    [invoice, job, jobLines] = await Promise.all([
      invoiceRef.get(),
      jobRef?.get() ?? Promise.resolve(null),
      input.jobId
        ? db.collection("jobLineItems").where("jobId", "==", input.jobId).get()
        : Promise.resolve(null),
    ]);
  if (invoice.exists) throw new ApiError(409, "An invoice already exists for this job.");
  if (input.sourceType === "job") {
    if (
      !job?.exists ||
      job.get("companyId") !== input.companyId ||
      job.get("branchId") !== input.branchId
    )
      throw new ApiError(404, "Approved job not found.");
    if (job.get("status") !== "ready")
      throw new ApiError(409, "An invoice can be issued only after the vehicle is marked Ready.");
    if (job.get("approvalStatus") !== "approved" || job.get("estimateLocked") !== true)
      throw new ApiError(409, "Approve and lock the estimate before invoicing.");
  }
  const sourceLines =
    input.lines ??
    jobLines?.docs
      .filter((line) => line.get("status") === "active")
      .map((line) => ({
        type: line.get("type") === "product" ? ("product" as const) : ("labour" as const),
        productId: (line.get("productId") as string | null | undefined) ?? null,
        description: String(line.get("description") ?? "Service"),
        quantity: Number(line.get("quantity") ?? 1),
        unit: String(line.get("unit") ?? "JOB"),
        unitPrice: Number(line.get("unitPrice") ?? 0),
        discount: Number(line.get("discount") ?? 0),
        gstRate: Number(line.get("gstRate") ?? 0),
      })) ??
    [];
  if (!sourceLines.length) throw new ApiError(409, "Add at least one invoice item.");
  const calculatedLines = sourceLines.map((line) => {
      const gross = line.quantity * line.unitPrice,
        discount = Math.min(line.discount, gross),
        taxableAmount = Math.max(0, gross - discount),
        taxAmount = (taxableAmount * line.gstRate) / 100;
      return {
        ...line,
        discount,
        taxableAmount,
        taxAmount,
        totalAmount: taxableAmount + taxAmount,
      };
    }),
    taxableAmount = calculatedLines.reduce((sum, line) => sum + line.taxableAmount, 0),
    taxAmount = calculatedLines.reduce((sum, line) => sum + line.taxAmount, 0),
    totalAmount = calculatedLines.reduce((sum, line) => sum + line.totalAmount, 0),
    branchSettings = await db
      .doc(`businessTaxProfiles/${input.companyId}/branches/${input.branchId}`)
      .get(),
    legacySettings = branchSettings.exists
      ? null
      : await db.doc(`businessTaxProfiles/${input.companyId}`).get(),
    settings = branchSettings.exists ? branchSettings : legacySettings!,
    registrationSettings =
      settings.exists && settings.get("gstRegistrationId")
        ? await db
            .doc(
              `businessTaxProfiles/${input.companyId}/gstRegistrations/${String(settings.get("gstRegistrationId"))}`,
            )
            .get()
        : null,
    taxRegistration = registrationSettings?.exists ? registrationSettings : settings,
    prefix =
      String(
        (settings.exists ? settings.get("invoicePrefix") : null) ??
          (taxRegistration.exists ? taxRegistration.get("invoicePrefix") : null) ??
          "INV",
      )
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(0, 4) || "INV",
    requestedStart = Number(
      (settings.exists ? settings.get("invoiceStartNumber") : null) ??
        (taxRegistration.exists ? taxRegistration.get("invoiceStartNumber") : 1),
    ),
    configuredStart = Number.isInteger(requestedStart)
      ? Math.max(1, Math.min(999999, requestedStart))
      : 1,
    nowDate = new Date(),
    startYear = nowDate.getMonth() >= 3 ? nowDate.getFullYear() : nowDate.getFullYear() - 1,
    financialYear = `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`,
    seriesKey = String(
      (settings.exists ? settings.get("invoiceSeriesKey") : null) ||
        (taxRegistration.exists
          ? taxRegistration.get("invoiceSeriesKey") || taxRegistration.get("gstin")
          : null) ||
        `${input.companyId}-UNREGISTERED-${input.branchId}`,
    ).replace(/[^A-Za-z0-9_-]/g, ""),
    sequenceRef = db.doc(`invoiceSequences/${input.companyId}_${seriesKey}_${financialYear}`),
    legacySequenceRef = db.doc(`invoiceSequences/${input.companyId}_${financialYear}`),
    receiptSequenceRef = db.doc(`receiptSequences/${input.companyId}_${financialYear}`),
    paymentRef = input.payment?.status !== "unpaid" ? db.collection("payments").doc() : null,
    requestedPayment =
      input.payment?.status === "full_paid"
        ? totalAmount
        : input.payment?.status === "part_paid"
          ? input.payment.amount
          : 0;
  if (requestedPayment < 0.01 && input.payment?.status !== "unpaid")
    throw new ApiError(400, "Enter the amount received.");
  if (requestedPayment > totalAmount + 0.001)
    throw new ApiError(400, "Payment cannot exceed the invoice total.");
  const issueResult = await db.runTransaction(async (transaction) => {
    const currentInvoice = await transaction.get(invoiceRef),
      sequence = await transaction.get(sequenceRef),
      legacySequence = sequence.exists ? null : await transaction.get(legacySequenceRef),
      receiptSequence = paymentRef ? await transaction.get(receiptSequenceRef) : null,
      previousSequence = sequence.exists
        ? sequence
        : legacySequence?.exists
          ? legacySequence
          : null,
      serial = previousSequence
        ? Number(previousSequence.get("lastNumber") ?? 0) + 1
        : configuredStart,
      effectivePrefix = previousSequence
        ? String(previousSequence.get("prefix") ?? prefix)
        : prefix;
    if (currentInvoice.exists) throw new ApiError(409, "An invoice already exists for this job.");
    if (serial > 999999) throw new ApiError(409, "Invoice series limit reached. Contact support.");
    const number = `${effectivePrefix}/${financialYear}/${String(serial).padStart(6, "0")}`;
    if (number.length > 16)
      throw new ApiError(409, "Invoice number exceeds the 16-character GST limit.");
    const stockUpdates: Array<{
      line: (typeof calculatedLines)[number];
      inventoryRef: FirebaseFirestore.DocumentReference;
      stockBefore: number;
    }> = [];
    if (input.sourceType === "counter_sale") {
      const productSales = new Map<string, (typeof calculatedLines)[number]>();
      for (const line of calculatedLines.filter(
        (item) => item.type === "product" && item.productId,
      )) {
        const existing = productSales.get(String(line.productId));
        productSales.set(String(line.productId), {
          ...line,
          quantity: (existing?.quantity ?? 0) + line.quantity,
        });
      }
      for (const line of productSales.values()) {
        const productRef = db.doc(`products/${line.productId}`),
          inventoryRef = db.doc(`inventoryItems/${input.branchId}_${line.productId}`),
          [product, inventory] = await Promise.all([
            transaction.get(productRef),
            transaction.get(inventoryRef),
          ]);
        if (!product.exists || product.get("companyId") !== input.companyId)
          throw new ApiError(409, `${line.description} is not in this company catalogue.`);
        if (product.get("trackInventory") === true) {
          const stockBefore = Number(inventory.get("currentStock") ?? 0);
          if (!inventory.exists || stockBefore < line.quantity)
            throw new ApiError(
              409,
              `${line.description} has only ${stockBefore} available in stock.`,
            );
          stockUpdates.push({ line, inventoryRef, stockBefore });
        }
      }
    }
    const now = FieldValue.serverTimestamp(),
      receiptSerial = receiptSequence
        ? receiptSequence.exists
          ? Number(receiptSequence.get("lastNumber") ?? 0) + 1
          : 1
        : 0,
      receiptNumber = paymentRef
        ? `RCPT/${financialYear}/${String(receiptSerial).padStart(6, "0")}`
        : "";
    transaction.set(
      sequenceRef,
      {
        companyId: input.companyId,
        seriesKey,
        financialYear,
        prefix: effectivePrefix,
        lastNumber: serial,
        ...(sequence.exists ? {} : { createdAt: now, createdBy: user.uid }),
        updatedAt: now,
        updatedBy: user.uid,
      },
      { merge: true },
    );
    transaction.create(invoiceRef, {
      companyId: input.companyId,
      branchId: input.branchId,
      sourceType: input.sourceType,
      jobId: input.jobId ?? "",
      jobNumber: String(job?.get("jobNumber") ?? ""),
      invoiceNumber: number,
      taxProfileId: settings.id,
      gstRegistrationId: String(settings.exists ? (settings.get("gstRegistrationId") ?? "") : ""),
      supplierLegalName: String(
        taxRegistration.exists ? (taxRegistration.get("legalName") ?? "") : "",
      ),
      supplierTradeName: String(settings.exists ? (settings.get("tradeName") ?? "") : ""),
      supplierGstin: String(taxRegistration.exists ? (taxRegistration.get("gstin") ?? "") : ""),
      supplierAddress: (settings.get("invoiceAddressMode") === "registered"
        ? [
            taxRegistration.get("registeredAddressLine1"),
            taxRegistration.get("registeredAddressLine2"),
            taxRegistration.get("registeredCity"),
            taxRegistration.get("state"),
            taxRegistration.get("registeredPostalCode"),
          ]
        : [
            settings.exists ? settings.get("addressLine1") : "",
            settings.exists ? settings.get("addressLine2") : "",
            settings.exists ? settings.get("city") : "",
            settings.exists ? settings.get("state") : "",
            settings.exists ? settings.get("postalCode") : "",
          ]
      )
        .filter(Boolean)
        .join(", "),
      invoiceAddressMode: String(settings.get("invoiceAddressMode") ?? "branch"),
      invoiceSeriesId: String(settings.get("invoiceSeriesId") ?? "shared"),
      customerId: String(job?.get("customerId") ?? input.customerId ?? "walk-in"),
      customerName: String(job?.get("customerName") ?? input.customerName ?? "Walk-In Customer"),
      vehicleId: String(job?.get("vehicleId") ?? ""),
      vehicleLabel: String(job?.get("vehicleLabel") ?? "Counter Sale"),
      registrationNumber: String(job?.get("registrationNumber") ?? ""),
      taxableAmount,
      taxAmount,
      totalAmount,
      paidAmount: requestedPayment,
      balanceAmount: Math.max(0, totalAmount - requestedPayment),
      status:
        requestedPayment >= totalAmount - 0.001
          ? "paid"
          : requestedPayment > 0
            ? "part_paid"
            : "issued",
      issuedAt: now,
      dueAt: input.dueAt || null,
      notes: input.notes.trim(),
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
    if (paymentRef && input.payment) {
      transaction.set(
        receiptSequenceRef,
        {
          companyId: input.companyId,
          financialYear,
          lastNumber: receiptSerial,
          ...(receiptSequence?.exists ? {} : { createdAt: now, createdBy: user.uid }),
          updatedAt: now,
          updatedBy: user.uid,
        },
        { merge: true },
      );
      transaction.create(paymentRef, {
        companyId: input.companyId,
        branchId: input.branchId,
        invoiceId: invoiceRef.id,
        jobId: input.jobId ?? "",
        receiptNumber,
        amount: requestedPayment,
        method: input.payment.method,
        reference: input.payment.reference.trim(),
        notes: input.payment.notes.trim(),
        receivedAt: now,
        status: "completed",
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    }
    for (const line of calculatedLines) {
      transaction.create(db.collection("invoiceLines").doc(), {
        companyId: input.companyId,
        branchId: input.branchId,
        invoiceId: invoiceRef.id,
        jobLineItemId: "",
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
        status: "active",
        amendmentNumber: 0,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    }
    for (const { line, inventoryRef, stockBefore } of stockUpdates) {
      const stockAfter = stockBefore - line.quantity;
      transaction.update(inventoryRef, {
        currentStock: stockAfter,
        updatedAt: now,
        updatedBy: user.uid,
      });
      transaction.create(db.collection("inventoryMovements").doc(), {
        companyId: input.companyId,
        branchId: input.branchId,
        productId: line.productId,
        inventoryItemId: inventoryRef.id,
        type: "issue",
        quantity: line.quantity,
        stockBefore,
        stockAfter,
        unitCost: line.unitPrice,
        reference: number,
        notes: "Counter sale invoice",
        occurredAt: now,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    }
    if (jobRef)
      transaction.update(jobRef, {
        invoiceTotal: totalAmount,
        updatedAt: now,
        updatedBy: user.uid,
      });
    return { invoiceNumber: number, receiptNumber };
  });
  const customerId = String(job?.get("customerId") ?? input.customerId ?? "walk-in");
  queueCustomerEventEmail({
    companyId: input.companyId,
    customerId,
    eventKey: `${invoiceRef.id}_invoice_issued`,
    eyebrow: "Invoice Issued",
    title: "Your invoice is ready",
    message: "Your workshop invoice has been issued. Please keep the invoice number for reference.",
    details: [
      { label: "Invoice Number", value: issueResult.invoiceNumber },
      ...(job?.get("jobNumber")
        ? [{ label: "Job Number", value: String(job.get("jobNumber")) }]
        : []),
      { label: "Invoice Total", value: formatRupees(totalAmount) },
      { label: "Balance", value: formatRupees(Math.max(0, totalAmount - requestedPayment)) },
    ],
  });
  if (requestedPayment > 0)
    queueCustomerEventEmail({
      companyId: input.companyId,
      customerId,
      eventKey: `${paymentRef?.id ?? invoiceRef.id}_payment_received`,
      eyebrow: "Payment Received",
      title: "Payment received",
      message: "Thank you. Your payment has been recorded successfully.",
      details: [
        { label: "Receipt Number", value: issueResult.receiptNumber },
        { label: "Amount Received", value: formatRupees(requestedPayment) },
        { label: "Balance", value: formatRupees(Math.max(0, totalAmount - requestedPayment)) },
      ],
    });
  return { issued: true, invoiceId: invoiceRef.id, ...issueResult };
}
async function amendInvoice(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = amendInvoiceSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid invoice amendment details.");
  const input = parsed.data;
  await financeManager(user.uid, input.companyId, input.branchId);
  const invoiceRef = db.doc(`invoices/${input.invoiceId}`),
    lineQuery = await db.collection("invoiceLines").where("invoiceId", "==", input.invoiceId).get(),
    activeLineDocs = lineQuery.docs.filter((line) => {
      const status = line.get("status");
      return !status || status === "active";
    }),
    calculatedLines = input.lines.map((line) => {
      const gross = line.quantity * line.unitPrice,
        discount = Math.min(line.discount, gross),
        taxableAmount = Math.max(0, gross - discount),
        taxAmount = (taxableAmount * line.gstRate) / 100;
      return {
        ...line,
        discount,
        taxableAmount,
        taxAmount,
        totalAmount: taxableAmount + taxAmount,
      };
    }),
    taxableAmount = calculatedLines.reduce((sum, line) => sum + line.taxableAmount, 0),
    taxAmount = calculatedLines.reduce((sum, line) => sum + line.taxAmount, 0),
    totalAmount = calculatedLines.reduce((sum, line) => sum + line.totalAmount, 0),
    today = new Date(),
    startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1,
    financialYear = `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`,
    receiptSequenceRef = db.doc(`receiptSequences/${input.companyId}_${financialYear}`),
    paymentRef = input.payment?.status !== "unpaid" ? db.collection("payments").doc() : null;

  const amendmentResult = await db.runTransaction(async (transaction) => {
    const invoice = await transaction.get(invoiceRef);
    if (
      !invoice.exists ||
      invoice.get("companyId") !== input.companyId ||
      invoice.get("branchId") !== input.branchId
    )
      throw new ApiError(404, "Invoice not found.");
    if (invoice.get("status") === "void")
      throw new ApiError(409, "A void invoice cannot be edited.");

    const receiptSequence = paymentRef ? await transaction.get(receiptSequenceRef) : null,
      oldLineSnapshots = await Promise.all(activeLineDocs.map((line) => transaction.get(line.ref))),
      sourceType = String(invoice.get("sourceType") ?? "job"),
      oldProducts = new Map<string, number>(),
      newProducts = new Map<string, number>();
    for (const line of oldLineSnapshots) {
      const productId = String(line.get("productId") ?? "");
      if (line.get("type") === "product" && productId)
        oldProducts.set(
          productId,
          (oldProducts.get(productId) ?? 0) + Number(line.get("quantity")),
        );
    }
    for (const line of calculatedLines) {
      const productId = String(line.productId ?? "");
      if (line.type === "product" && productId)
        newProducts.set(productId, (newProducts.get(productId) ?? 0) + line.quantity);
    }

    const stockChanges: Array<{
      productId: string;
      description: string;
      inventoryRef: FirebaseFirestore.DocumentReference;
      stockBefore: number;
      delta: number;
    }> = [];
    if (sourceType === "counter_sale") {
      const productIds = [...new Set([...oldProducts.keys(), ...newProducts.keys()])];
      for (const productId of productIds) {
        const productRef = db.doc(`products/${productId}`),
          inventoryRef = db.doc(`inventoryItems/${input.branchId}_${productId}`),
          [product, inventory] = await Promise.all([
            transaction.get(productRef),
            transaction.get(inventoryRef),
          ]);
        if (!product.exists || product.get("companyId") !== input.companyId)
          throw new ApiError(409, "An invoice product is not in this company catalogue.");
        if (product.get("trackInventory") === true) {
          const delta = (newProducts.get(productId) ?? 0) - (oldProducts.get(productId) ?? 0),
            stockBefore = Number(inventory.get("currentStock") ?? 0);
          if (delta > 0 && (!inventory.exists || stockBefore < delta))
            throw new ApiError(
              409,
              `${String(product.get("name") ?? "Product")} has only ${stockBefore} available in stock.`,
            );
          if (delta !== 0)
            stockChanges.push({
              productId,
              description: String(product.get("name") ?? "Product"),
              inventoryRef,
              stockBefore,
              delta,
            });
        }
      }
    }

    const now = FieldValue.serverTimestamp(),
      previousPaid = Number(invoice.get("paidAmount") ?? 0),
      availableBalance = Math.max(0, totalAmount - previousPaid),
      paymentAmount =
        input.payment?.status === "full_paid"
          ? availableBalance
          : input.payment?.status === "part_paid"
            ? input.payment.amount
            : 0;
    if (paymentRef && paymentAmount < 0.01)
      throw new ApiError(400, "Enter the additional amount received.");
    if (paymentAmount > availableBalance + 0.001)
      throw new ApiError(400, "Payment cannot exceed the revised balance.");
    const paidAmount = previousPaid + paymentAmount,
      balanceAmount = Math.max(0, totalAmount - paidAmount),
      overpaidAmount = Math.max(0, paidAmount - totalAmount),
      amendmentNumber = Number(invoice.get("amendmentCount") ?? 0) + 1,
      nextStatus = balanceAmount <= 0 ? "paid" : paidAmount > 0 ? "part_paid" : "issued",
      receiptSerial = receiptSequence
        ? receiptSequence.exists
          ? Number(receiptSequence.get("lastNumber") ?? 0) + 1
          : 1
        : 0,
      receiptNumber = paymentRef
        ? `RCPT/${financialYear}/${String(receiptSerial).padStart(6, "0")}`
        : "";
    transaction.create(db.collection("invoiceAmendments").doc(), {
      companyId: input.companyId,
      branchId: input.branchId,
      invoiceId: invoice.id,
      invoiceNumber: String(invoice.get("invoiceNumber") ?? ""),
      amendmentNumber,
      reason: input.reason.trim(),
      previousTotals: {
        taxableAmount: Number(invoice.get("taxableAmount") ?? 0),
        taxAmount: Number(invoice.get("taxAmount") ?? 0),
        totalAmount: Number(invoice.get("totalAmount") ?? 0),
      },
      revisedTotals: { taxableAmount, taxAmount, totalAmount },
      previousLines: oldLineSnapshots.map((line) => ({ id: line.id, ...line.data() })),
      revisedLines: calculatedLines,
      createdAt: now,
      createdBy: user.uid,
    });
    for (const line of oldLineSnapshots)
      transaction.update(line.ref, {
        status: "superseded",
        supersededAt: now,
        supersededBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    for (const line of calculatedLines)
      transaction.create(db.collection("invoiceLines").doc(), {
        companyId: input.companyId,
        branchId: input.branchId,
        invoiceId: invoice.id,
        jobLineItemId: "",
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
        status: "active",
        amendmentNumber,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    transaction.update(invoiceRef, {
      taxableAmount,
      taxAmount,
      totalAmount,
      balanceAmount,
      overpaidAmount,
      status: nextStatus,
      dueAt: input.dueAt || null,
      notes: input.notes.trim(),
      amendmentCount: amendmentNumber,
      lastAmendmentReason: input.reason.trim(),
      lastAmendedAt: now,
      lastAmendedBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
    if (paymentRef && input.payment) {
      transaction.set(
        receiptSequenceRef,
        {
          companyId: input.companyId,
          financialYear,
          lastNumber: receiptSerial,
          ...(receiptSequence?.exists ? {} : { createdAt: now, createdBy: user.uid }),
          updatedAt: now,
          updatedBy: user.uid,
        },
        { merge: true },
      );
      transaction.create(paymentRef, {
        companyId: input.companyId,
        branchId: input.branchId,
        invoiceId: invoice.id,
        jobId: String(invoice.get("jobId") ?? ""),
        receiptNumber,
        amount: paymentAmount,
        method: input.payment.method,
        reference: input.payment.reference.trim(),
        notes: input.payment.notes.trim(),
        receivedAt: now,
        status: "completed",
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    }
    const jobId = String(invoice.get("jobId") ?? "");
    if (jobId)
      transaction.update(db.doc(`jobSheets/${jobId}`), {
        invoiceTotal: totalAmount,
        updatedAt: now,
        updatedBy: user.uid,
      });
    for (const change of stockChanges) {
      const stockAfter = change.stockBefore - change.delta;
      transaction.update(change.inventoryRef, {
        currentStock: stockAfter,
        updatedAt: now,
        updatedBy: user.uid,
      });
      transaction.create(db.collection("inventoryMovements").doc(), {
        companyId: input.companyId,
        branchId: input.branchId,
        productId: change.productId,
        inventoryItemId: change.inventoryRef.id,
        type: change.delta > 0 ? "issue" : "adjustment_in",
        quantity: Math.abs(change.delta),
        stockBefore: change.stockBefore,
        stockAfter,
        unitCost: 0,
        reference: String(invoice.get("invoiceNumber") ?? ""),
        notes: `Invoice amendment ${amendmentNumber}: ${input.reason.trim()}`,
        occurredAt: now,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
    }
    return { receiptNumber };
  });
  return { amended: true, invoiceId: input.invoiceId, ...amendmentResult };
}
async function requireActiveSubscription(companyId: string, branchId: string) {
  const subscription = await db.doc(`branchSubscriptions/${branchId}`).get(),
    periodEnd = subscription.get("currentPeriodEnd")?.toDate?.() as Date | undefined;
  if (
    !subscription.exists ||
    subscription.get("companyId") !== companyId ||
    !["trialing", "active", "grace_period"].includes(String(subscription.get("status") ?? "")) ||
    !periodEnd ||
    periodEnd.getTime() < Date.now()
  )
    throw new ApiError(402, "The company subscription has ended. Contact Digital Viyabari.");
}
async function sender(uid: string, companyId: string, branchId: string) {
  await requireActiveSubscription(companyId, branchId);
  const member = await db.doc(`memberships/${uid}_${companyId}`).get();
  if (!member.exists || member.get("status") !== "active")
    throw new ApiError(403, "No active company membership.");
  const company = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId?: string; roles?: string[] }[] | undefined) ??
      [];
  if (
    !company.some((role) => ["company_owner", "company_admin"].includes(role)) &&
    !assignments.some(
      (item) =>
        item.branchId === branchId &&
        item.roles?.some((role) =>
          ["branch_manager", "service_advisor", "receptionist"].includes(role),
        ),
    )
  )
    throw new ApiError(403, "Messaging permission is required.");
}
async function teamManager(uid: string, companyId: string, branchId: string) {
  await requireActiveSubscription(companyId, branchId);
  const member = await db.doc(`memberships/${uid}_${companyId}`).get(),
    company = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    owner = company.some((role) => ["company_owner", "company_admin"].includes(role)),
    manager = assignments.some(
      (item) => item.branchId === branchId && item.roles.includes("branch_manager"),
    );
  if (!member.exists || member.get("status") !== "active" || (!owner && !manager))
    throw new ApiError(403, "Owner, Administrator or Branch Manager access is required.");
  return { owner, manager };
}
async function financeManager(uid: string, companyId: string, branchId: string) {
  await requireActiveSubscription(companyId, branchId);
  const member = await db.doc(`memberships/${uid}_${companyId}`).get(),
    company = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    allowed =
      company.some((role) =>
        ["company_owner", "company_admin", "company_accountant"].includes(role),
      ) ||
      assignments.some(
        (item) =>
          item.branchId === branchId &&
          item.roles.some((role) => ["branch_manager", "finance_manager"].includes(role)),
      );
  if (!member.exists || member.get("status") !== "active" || !allowed)
    throw new ApiError(403, "Finance Manager access is required.");
}
function apiDocumentData(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(apiDocumentData);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        apiDocumentData(item),
      ]),
    );
  return value;
}
async function invoiceWorkspace(user: DecodedIdToken, companyId: string, branchId: string) {
  if (!companyId || !branchId) throw new ApiError(400, "Company and branch are required.");
  await financeManager(user.uid, companyId, branchId);
  const branchQuery = (collectionName: string) =>
      db
        .collection(collectionName)
        .where("companyId", "==", companyId)
        .where("branchId", "==", branchId)
        .get(),
    [
      invoices,
      jobs,
      jobLines,
      invoiceLines,
      payments,
      customers,
      products,
      inventory,
      branchProfile,
      legacyProfile,
    ] = await Promise.all([
      branchQuery("invoices"),
      branchQuery("jobSheets"),
      branchQuery("jobLineItems"),
      branchQuery("invoiceLines"),
      branchQuery("payments"),
      branchQuery("customers"),
      db.collection("products").where("companyId", "==", companyId).get(),
      branchQuery("inventoryItems"),
      db.doc(`businessTaxProfiles/${companyId}/branches/${branchId}`).get(),
      db.doc(`businessTaxProfiles/${companyId}`).get(),
    ]),
    documents = (snapshot: Awaited<ReturnType<typeof branchQuery>>) =>
      snapshot.docs.map((item) => apiDocumentData({ id: item.id, ...item.data() }));
  return {
    invoices: documents(invoices),
    jobs: documents(jobs),
    jobLines: documents(jobLines),
    invoiceLines: documents(invoiceLines),
    payments: documents(payments),
    customers: customers.docs.map((item) =>
      apiDocumentData({
        id: item.id,
        name: item.get("name") ?? "Customer",
        phone: item.get("phone") ?? "",
        gstin: item.get("gstin") ?? "",
        address: item.get("address") ?? "",
        status: item.get("status") ?? "active",
      }),
    ),
    products: documents(products),
    inventory: documents(inventory),
    taxProfile: apiDocumentData(
      branchProfile.exists
        ? { id: branchProfile.id, ...branchProfile.data() }
        : legacyProfile.exists
          ? { id: legacyProfile.id, ...legacyProfile.data() }
          : null,
    ),
  };
}
async function getBusinessSettings(user: DecodedIdToken, companyId: string, branchId: string) {
  if (!companyId || !branchId) throw new ApiError(400, "Company and branch are required.");
  await financeManager(user.uid, companyId, branchId);
  const branchRef = db.doc(`businessTaxProfiles/${companyId}/branches/${branchId}`),
    branchSettings = await branchRef.get(),
    legacySettings = branchSettings.exists
      ? null
      : await db.doc(`businessTaxProfiles/${companyId}`).get(),
    settings = branchSettings.exists ? branchSettings : legacySettings,
    selectedRegistration =
      settings?.exists && settings.get("gstRegistrationId")
        ? await db
            .doc(
              `businessTaxProfiles/${companyId}/gstRegistrations/${String(settings.get("gstRegistrationId"))}`,
            )
            .get()
        : null,
    registrations = await db
      .collection(`businessTaxProfiles/${companyId}/gstRegistrations`)
      .where("status", "==", "active")
      .get(),
    branchProfiles = await db.collection(`businessTaxProfiles/${companyId}/branches`).get(),
    branches = await db.collection("branches").where("companyId", "==", companyId).get(),
    branchNames = new Map(
      branches.docs.map((branch) => [branch.id, String(branch.get("name") ?? "Branch")]),
    );
  return {
    exists: branchSettings.exists,
    profile: settings?.exists
      ? {
          ...settings.data(),
          ...(selectedRegistration?.exists
            ? {
                registeredAddressLine1: selectedRegistration.get("registeredAddressLine1") ?? "",
                registeredAddressLine2: selectedRegistration.get("registeredAddressLine2") ?? "",
                registeredCity: selectedRegistration.get("registeredCity") ?? "",
                registeredPostalCode: selectedRegistration.get("registeredPostalCode") ?? "",
              }
            : {}),
        }
      : null,
    registrations: registrations.docs.map((item) => ({ id: item.id, ...item.data() })),
    branchSetups: branchProfiles.docs.map((item) => ({
      branchId: item.id,
      branchName: branchNames.get(item.id) ?? "Branch",
      gstRegistrationId: String(item.get("gstRegistrationId") ?? ""),
      gstin: String(item.get("gstin") ?? ""),
      addressLine1: String(item.get("addressLine1") ?? ""),
      addressLine2: String(item.get("addressLine2") ?? ""),
      city: String(item.get("city") ?? ""),
      state: String(item.get("state") ?? ""),
      stateCode: String(item.get("stateCode") ?? ""),
      postalCode: String(item.get("postalCode") ?? ""),
      invoicePrefix: String(item.get("invoicePrefix") ?? "INV"),
      invoiceStartNumber: Number(item.get("invoiceStartNumber") ?? 1),
    })),
  };
}
async function saveBusinessSettings(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = businessSettingsSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Check the required business and GST fields.");
  const input = parsed.data,
    access = await teamManager(user.uid, input.companyId, input.branchId);
  if (!access.owner) throw new ApiError(403, "Only the business owner can change GST settings.");
  const profile = input.profile,
    gstin = input.gstSetup === "unregistered" ? "" : profile.gstin.trim().toUpperCase(),
    pan = profile.pan.trim().toUpperCase(),
    invoicePrefix = profile.invoicePrefix.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (input.gstSetup !== "unregistered" && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin))
    throw new ApiError(400, "Enter a valid 15-character GSTIN.");
  if (!invoicePrefix) throw new ApiError(400, "Enter a valid invoice prefix.");
  if (
    input.gstSetup !== "unregistered" &&
    (!profile.registeredAddressLine1.trim() ||
      !profile.registeredCity.trim() ||
      !profile.registeredPostalCode.trim())
  )
    throw new ApiError(400, "Complete the GST-registered address.");
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) throw new ApiError(400, "Enter a valid PAN.");
  const registrationId =
      input.gstSetup === "unregistered"
        ? ""
        : input.gstSetup === "existing"
          ? profile.gstRegistrationId
          : `${input.companyId}_${gstin}`,
    registrationRef = registrationId
      ? db.doc(`businessTaxProfiles/${input.companyId}/gstRegistrations/${registrationId}`)
      : null,
    existingRegistration = registrationRef ? await registrationRef.get() : null;
  if (input.gstSetup === "existing" && !existingRegistration?.exists)
    throw new ApiError(404, "Select an existing GST registration.");
  if (input.gstSetup === "new" && existingRegistration?.exists)
    throw new ApiError(409, "This GSTIN already exists. Select the existing registration.");
  const normalizeAddress = (...parts: string[]) =>
      parts
        .map((part) =>
          part
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, ""),
        )
        .filter(Boolean)
        .join("|"),
    addressFingerprint = normalizeAddress(
      profile.addressLine1,
      profile.addressLine2,
      profile.city,
      profile.state,
      profile.stateCode,
      profile.postalCode,
    ),
    branchProfiles = await db.collection(`businessTaxProfiles/${input.companyId}/branches`).get(),
    siblingProfiles = branchProfiles.docs.filter(
      (branch) =>
        branch.id !== input.branchId &&
        String(branch.get("gstRegistrationId") ?? "") === registrationId,
    ),
    matchingAddress = siblingProfiles.find((branch) => {
      const savedFingerprint = String(branch.get("addressFingerprint") ?? "");
      return (
        (savedFingerprint ||
          normalizeAddress(
            String(branch.get("addressLine1") ?? ""),
            String(branch.get("addressLine2") ?? ""),
            String(branch.get("city") ?? ""),
            String(branch.get("state") ?? ""),
            String(branch.get("stateCode") ?? ""),
            String(branch.get("postalCode") ?? ""),
          )) === addressFingerprint
      );
    }),
    seriesMode =
      input.gstSetup === "unregistered"
        ? "branch"
        : matchingAddress
          ? String(matchingAddress.get("invoiceSeriesMode") ?? "shared")
          : siblingProfiles.length > 0
            ? "branch"
            : "shared",
    baseSeriesKey = String(existingRegistration?.get("invoiceSeriesKey") || gstin),
    seriesId = matchingAddress
      ? String(matchingAddress.get("invoiceSeriesId") ?? "shared")
      : seriesMode === "shared"
        ? "shared"
        : input.branchId,
    seriesKey =
      input.gstSetup === "unregistered"
        ? `${input.companyId}-UNREGISTERED-${input.branchId}`
        : matchingAddress
          ? String(matchingAddress.get("invoiceSeriesKey") ?? baseSeriesKey)
          : seriesMode === "shared"
            ? baseSeriesKey
            : `${baseSeriesKey}-${input.branchId}`,
    registrationPrefix = matchingAddress
      ? String(matchingAddress.get("invoicePrefix") ?? invoicePrefix)
      : seriesMode === "shared"
        ? invoicePrefix
        : String(existingRegistration?.get("invoicePrefix") ?? invoicePrefix),
    registrationStartNumber = matchingAddress
      ? Number(matchingAddress.get("invoiceStartNumber") ?? profile.invoiceStartNumber)
      : seriesMode === "shared"
        ? profile.invoiceStartNumber
        : Number(existingRegistration?.get("invoiceStartNumber") ?? profile.invoiceStartNumber),
    now = FieldValue.serverTimestamp(),
    branchRef = db.doc(`businessTaxProfiles/${input.companyId}/branches/${input.branchId}`),
    existingBranch = await branchRef.get(),
    branchRecord = await db.doc(`branches/${input.branchId}`).get(),
    siblingSeries = registrationRef
      ? await registrationRef.collection("invoiceSeries").get()
      : null,
    prefixBase =
      String(branchRecord.get("code") ?? profile.branchAddressName ?? "BR")
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(0, 4) || "BR",
    usedPrefixes = new Set(
      (siblingSeries?.docs ?? [])
        .filter((series) => series.id !== seriesId && series.get("status") === "active")
        .map((series) => String(series.get("prefix") ?? "").toUpperCase()),
    ),
    automaticBranchPrefix = (() => {
      if (
        existingBranch.exists &&
        existingBranch.get("invoiceSeriesMode") === "branch" &&
        existingBranch.get("addressFingerprint") === addressFingerprint
      )
        return String(existingBranch.get("invoicePrefix") ?? prefixBase);
      if (!usedPrefixes.has(prefixBase)) return prefixBase;
      for (let index = 1; index <= 99; index += 1) {
        const candidate = `${prefixBase.slice(0, Math.max(1, 4 - String(index).length))}${index}`;
        if (!usedPrefixes.has(candidate)) return candidate;
      }
      return input.branchId
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(-4);
    })(),
    movingToExistingSeries =
      Boolean(matchingAddress) &&
      String(existingBranch.get("invoiceSeriesKey") ?? "") !== seriesKey,
    effectivePrefix = movingToExistingSeries
      ? String(matchingAddress?.get("invoicePrefix") ?? registrationPrefix)
      : seriesMode === "branch" &&
          existingBranch.get("invoiceSeriesMode") !== "branch" &&
          usedPrefixes.has(invoicePrefix)
        ? automaticBranchPrefix
        : invoicePrefix || automaticBranchPrefix,
    effectiveStartNumber = movingToExistingSeries
      ? Number(matchingAddress?.get("invoiceStartNumber") ?? registrationStartNumber)
      : profile.invoiceStartNumber,
    batch = db.batch();
  if (usedPrefixes.has(effectivePrefix))
    throw new ApiError(409, "This invoice prefix is already used. Enter a different prefix.");
  if (existingBranch.exists) {
    const nowDate = new Date(),
      startYear = nowDate.getMonth() >= 3 ? nowDate.getFullYear() : nowDate.getFullYear() - 1,
      financialYear = `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`,
      staysInSameSeries =
        String(existingBranch.get("gstRegistrationId") ?? "") === registrationId &&
        String(existingBranch.get("invoiceSeriesKey") ?? "") === seriesKey,
      changedNumberConfiguration =
        staysInSameSeries &&
        (String(existingBranch.get("invoicePrefix") ?? "INV") !== effectivePrefix ||
          Number(existingBranch.get("invoiceStartNumber") ?? 1) !== effectiveStartNumber);
    if (changedNumberConfiguration) {
      const companyInvoices = await db
        .collection("invoices")
        .where("companyId", "==", input.companyId)
        .get();
      const relatedBranchIds = new Set([
        input.branchId,
        ...branchProfiles.docs
          .filter((branch) => String(branch.get("invoiceSeriesKey") ?? "") === seriesKey)
          .map((branch) => branch.id),
      ]);
      if (
        companyInvoices.docs.some(
          (invoice) =>
            relatedBranchIds.has(String(invoice.get("branchId") ?? "")) &&
            String(invoice.get("invoiceNumber") ?? "").includes(`/${financialYear}/`),
        )
      )
        throw new ApiError(
          409,
          "Invoice prefix and starting number cannot change after an invoice is issued in this financial year.",
        );
    }
  }
  if (registrationRef) {
    const registrationValues = {
      id: registrationId,
      companyId: input.companyId,
      gstin,
      legalName: profile.legalName.trim(),
      pan,
      registrationType: profile.registrationType === "composition" ? "composition" : "regular",
      state: profile.state.trim(),
      stateCode: profile.stateCode.trim(),
      registeredAddressLine1: profile.registeredAddressLine1.trim(),
      registeredAddressLine2: profile.registeredAddressLine2.trim(),
      registeredCity: profile.registeredCity.trim(),
      registeredPostalCode: profile.registeredPostalCode.trim(),
      invoicePrefix: registrationPrefix,
      invoiceStartNumber: registrationStartNumber,
      invoiceSeriesKey: baseSeriesKey,
      status: "active",
      updatedAt: now,
      updatedBy: user.uid,
    };
    batch.set(
      registrationRef,
      existingRegistration?.exists
        ? registrationValues
        : { ...registrationValues, createdAt: now, createdBy: user.uid },
      { merge: true },
    );
    const seriesRef = registrationRef.collection("invoiceSeries").doc(seriesId),
      existingSeries = await seriesRef.get();
    batch.set(
      seriesRef,
      {
        id: seriesId,
        companyId: input.companyId,
        gstRegistrationId: registrationId,
        branchId:
          seriesMode === "branch" ? String(existingSeries.get("branchId") ?? input.branchId) : null,
        mode: seriesMode,
        prefix: effectivePrefix,
        invoiceStartNumber: effectiveStartNumber,
        invoiceSeriesKey: seriesKey,
        status: "active",
        updatedAt: now,
        updatedBy: user.uid,
        ...(existingSeries.exists ? {} : { createdAt: now, createdBy: user.uid }),
      },
      { merge: true },
    );
  }
  const values = {
    ...profile,
    companyId: input.companyId,
    branchId: input.branchId,
    gstRegistrationId: registrationId,
    gstRegistered: input.gstSetup !== "unregistered",
    gstin,
    pan,
    registrationType: input.gstSetup === "unregistered" ? "unregistered" : profile.registrationType,
    invoicePrefix: effectivePrefix,
    invoiceStartNumber: effectiveStartNumber,
    invoiceSeriesKey: seriesKey,
    invoiceSeriesId: seriesId,
    invoiceSeriesMode: seriesMode,
    invoiceAddressMode: "branch",
    addressFingerprint,
    updatedAt: now,
    updatedBy: user.uid,
  };
  batch.set(
    branchRef,
    existingBranch.exists ? values : { ...values, createdAt: now, createdBy: user.uid },
    { merge: true },
  );
  for (const sibling of siblingProfiles.filter(
    (branch) => String(branch.get("invoiceSeriesKey") ?? "") === seriesKey,
  ))
    batch.set(
      sibling.ref,
      {
        invoicePrefix: effectivePrefix,
        invoiceStartNumber: effectiveStartNumber,
        updatedAt: now,
        updatedBy: user.uid,
      },
      { merge: true },
    );
  await batch.commit();
  return {
    saved: true,
    gstRegistrationId: registrationId,
    invoiceSeriesMode: seriesMode,
    invoicePrefix: effectivePrefix,
  };
}
async function jobManager(uid: string, companyId: string, branchId: string) {
  await requireActiveSubscription(companyId, branchId);
  const member = await db.doc(`memberships/${uid}_${companyId}`).get(),
    company = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    allowed =
      company.some((role) => ["company_owner", "company_admin"].includes(role)) ||
      assignments.some(
        (item) =>
          item.branchId === branchId &&
          item.roles.some((role) => ["branch_manager", "job_creator"].includes(role)),
      );
  if (!member.exists || member.get("status") !== "active" || !allowed)
    throw new ApiError(403, "Job creation access is required.");
}
async function createJob(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = createJobSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid job details.");
  const input = parsed.data;
  await jobManager(user.uid, input.companyId, input.branchId);
  const [customer, vehicle, branch] = await Promise.all([
    db.doc(`customers/${input.customerId}`).get(),
    db.doc(`vehicles/${input.vehicleId}`).get(),
    db.doc(`branches/${input.branchId}`).get(),
  ]);
  if (
    !customer.exists ||
    customer.get("companyId") !== input.companyId ||
    customer.get("branchId") !== input.branchId
  )
    throw new ApiError(404, "Customer not found in this branch.");
  if (
    !vehicle.exists ||
    vehicle.get("companyId") !== input.companyId ||
    vehicle.get("branchId") !== input.branchId ||
    vehicle.get("customerId") !== input.customerId
  )
    throw new ApiError(404, "Vehicle not found for this customer.");
  const vehicleJobs = await db
      .collection("jobSheets")
      .where("vehicleId", "==", input.vehicleId)
      .get(),
    activeVehicleJobs = vehicleJobs.docs.filter(
      (item) =>
        item.get("companyId") === input.companyId &&
        item.get("branchId") === input.branchId &&
        !["delivered", "cancelled"].includes(String(item.get("status"))),
    );
  if (activeVehicleJobs.length)
    throw new ApiError(
      409,
      `This vehicle is already inside the workshop under ${String(activeVehicleJobs[0]?.get("jobNumber") ?? "an active job")}.`,
    );
  const nowDate = new Date(),
    startYear = nowDate.getMonth() >= 3 ? nowDate.getFullYear() : nowDate.getFullYear() - 1,
    financialYear = `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`,
    branchSeries = String(branch.get("code") ?? "MB")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase()
      .padEnd(2, "X"),
    sequenceRef = db.doc(`jobSequences/${input.companyId}_${input.branchId}_${financialYear}`),
    jobRef = db.collection("jobSheets").doc();
  const jobNumber = await db.runTransaction(async (transaction) => {
    const sequence = await transaction.get(sequenceRef),
      serial = sequence.exists ? Number(sequence.get("lastNumber") ?? 0) + 1 : 1,
      number = `${branchSeries}/${financialYear}/${String(serial).padStart(6, "0")}`,
      now = FieldValue.serverTimestamp();
    transaction.set(
      sequenceRef,
      {
        companyId: input.companyId,
        branchId: input.branchId,
        financialYear,
        lastNumber: serial,
        ...(sequence.exists ? {} : { createdAt: now, createdBy: user.uid }),
        updatedAt: now,
        updatedBy: user.uid,
      },
      { merge: true },
    );
    transaction.create(jobRef, {
      companyId: input.companyId,
      branchId: input.branchId,
      jobNumber: number,
      customerId: customer.id,
      vehicleId: vehicle.id,
      customerName: customer.get("name") ?? "Customer",
      vehicleLabel: `${vehicle.get("make") ?? ""} ${vehicle.get("model") ?? ""}`.trim(),
      registrationNumber: vehicle.get("registrationNumber") ?? "",
      status: "check_in",
      priority: input.priority,
      serviceType: input.serviceType,
      odometer: input.odometer,
      fuelLevel: input.fuelLevel,
      complaints: input.complaints,
      internalNotes: input.internalNotes,
      promisedAt: input.promisedAt,
      checkedInAt: now,
      assignedTechnicianIds: [],
      estimateTotal: 0,
      invoiceTotal: 0,
      approvalStatus: "draft",
      estimateLocked: false,
      estimateRevision: 1,
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
    return number;
  });
  queueCustomerEventEmail({
    companyId: input.companyId,
    customerId: customer.id,
    eventKey: `${jobRef.id}_job_created`,
    eyebrow: "Workshop Check-In",
    title: "Job card created",
    message:
      "Your vehicle has been checked in and the workshop team will begin the service process.",
    details: [
      { label: "Job Number", value: jobNumber },
      { label: "Vehicle", value: String(vehicle.get("registrationNumber") ?? "") },
      { label: "Service", value: input.serviceType },
    ],
  });
  return { created: true, jobId: jobRef.id, jobNumber };
}
async function changeJobStatus(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = jobStatusSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid job status details.");
  const input = parsed.data,
    member = await db.doc(`memberships/${user.uid}_${input.companyId}`).get(),
    companyRoles = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    roles = assignments.find((item) => item.branchId === input.branchId)?.roles ?? [],
    branchIds = (member.get("branchIds") as string[] | undefined) ?? [],
    branchRoleKeys = (member.get("branchRoleKeys") as string[] | undefined) ?? [],
    manager =
      companyRoles.some((role) => ["company_owner", "company_admin"].includes(role)) ||
      roles.includes("branch_manager") ||
      (branchIds.includes(input.branchId) && branchRoleKeys.includes("branch_manager")),
    technician =
      roles.includes("technician") ||
      (branchIds.includes(input.branchId) && branchRoleKeys.includes("technician"));
  if (!member.exists || member.get("status") !== "active" || (!manager && !technician))
    throw new ApiError(403, "Workshop operation access is required.");

  const jobRef = db.doc(`jobSheets/${input.jobId}`),
    invoiceRef = db.doc(`invoices/${input.jobId}`),
    job = await jobRef.get();
  if (
    !job.exists ||
    job.get("companyId") !== input.companyId ||
    job.get("branchId") !== input.branchId
  )
    throw new ApiError(404, "Job card not found in this branch.");
  const current = String(job.get("status")),
    ordered = [
      "check_in",
      "inspection",
      "estimate_pending",
      "approved",
      "in_progress",
      "quality_check",
      "ready",
      "delivered",
    ],
    expected = ordered[ordered.indexOf(current) + 1];
  if (input.status !== "cancelled" && input.status !== expected)
    throw new ApiError(409, `Move this job from ${current} to ${expected ?? "its next stage"}.`);
  if (input.status === "cancelled") {
    if (!manager) throw new ApiError(403, "Only an Owner or Branch Manager can cancel a job.");
    if (["delivered", "cancelled"].includes(current))
      throw new ApiError(409, "This job can no longer be cancelled.");
    if (input.cancellationReason.trim().length < 3)
      throw new ApiError(400, "Enter a cancellation reason.");
  }
  if (technician && !manager) {
    const assigned = (job.get("assignedTechnicianIds") as string[] | undefined) ?? [];
    if (!assigned.includes(user.uid)) throw new ApiError(403, "This job is not assigned to you.");
    if (
      !expected ||
      !["inspection", "estimate_pending", "in_progress", "quality_check"].includes(input.status)
    )
      throw new ApiError(403, "A manager must complete this stage.");
  }
  if (input.status === "in_progress") {
    const assigned = input.assignedTechnicianId
      ? [input.assignedTechnicianId]
      : ((job.get("assignedTechnicianIds") as string[] | undefined) ?? []);
    if (!assigned.length) throw new ApiError(409, "Assign a technician before starting the work.");
    if (input.assignedTechnicianId) {
      if (!manager) throw new ApiError(403, "Only a manager can assign workshop staff.");
      const assignedMember = await db
        .doc(`memberships/${input.assignedTechnicianId}_${input.companyId}`)
        .get();
      const assignedBranches =
        (assignedMember.get("branchAssignments") as
          { branchId: string; roles: string[] }[] | undefined) ?? [];
      if (
        !assignedMember.exists ||
        assignedMember.get("status") !== "active" ||
        !assignedBranches.some(
          (item) => item.branchId === input.branchId && item.roles.includes("technician"),
        )
      )
        throw new ApiError(409, "Select an active technician from this branch.");
    }
  }
  if (input.status === "ready") {
    if (!manager)
      throw new ApiError(403, "An Owner or Branch Manager must complete the quality check.");
    if (input.qualityNotes.trim().length < 3)
      throw new ApiError(400, "Confirm the quality check and add a short note.");
  }
  if (input.status === "delivered") {
    if (!manager) throw new ApiError(403, "Only an Owner or Branch Manager can deliver a vehicle.");
    if (!(await invoiceRef.get()).exists)
      throw new ApiError(409, "Issue an invoice before delivering the vehicle.");
  }

  const now = FieldValue.serverTimestamp(),
    update: Record<string, unknown> = {
      status: input.status,
      updatedAt: now,
      updatedBy: user.uid,
    };
  if (input.status === "in_progress" && input.assignedTechnicianId)
    update.assignedTechnicianIds = [input.assignedTechnicianId];
  if (input.status === "ready") {
    update.qualityCheckedAt = now;
    update.qualityCheckedBy = user.uid;
    update.qualityCheckNotes = input.qualityNotes.trim();
  }
  if (input.status === "cancelled") {
    update.cancelledAt = now;
    update.cancelledBy = user.uid;
    update.cancellationReason = input.cancellationReason.trim();
  }
  if (input.status === "delivered") {
    update.deliveredAt = now;
    update.deliveryNotes = input.deliveryNotes.trim();
    update.nextServiceDueAt = input.nextServiceDueAt ?? null;
    update.nextServiceDueKm = input.nextServiceDueKm ?? null;
  }
  const batch = db.batch();
  batch.update(jobRef, update);
  if (
    input.status === "delivered" &&
    (input.nextServiceDueAt || typeof input.nextServiceDueKm === "number")
  ) {
    batch.set(db.doc(`serviceReminders/${input.jobId}`), {
      companyId: input.companyId,
      branchId: input.branchId,
      jobId: input.jobId,
      customerId: job.get("customerId"),
      vehicleId: job.get("vehicleId"),
      registrationNumber: job.get("registrationNumber"),
      dueAt: input.nextServiceDueAt ?? null,
      dueKm: input.nextServiceDueKm ?? null,
      status: "scheduled",
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
  }
  await batch.commit();
  if (input.status === "ready" || input.status === "delivered")
    queueCustomerEventEmail({
      companyId: input.companyId,
      customerId: String(job.get("customerId")),
      eventKey: `${input.jobId}_${input.status}`,
      eyebrow: input.status === "ready" ? "Service Complete" : "Vehicle Delivery",
      title: input.status === "ready" ? "Your vehicle is ready" : "Vehicle delivered",
      message:
        input.status === "ready"
          ? "The approved work and quality check are complete. Your vehicle is ready for delivery."
          : "Your vehicle delivery has been recorded successfully. Thank you for choosing our workshop.",
      details: [
        { label: "Job Number", value: String(job.get("jobNumber") ?? "") },
        { label: "Vehicle", value: String(job.get("registrationNumber") ?? "") },
        { label: "Status", value: input.status === "ready" ? "Ready" : "Delivered" },
      ],
    });
  return { updated: true, status: input.status };
}
async function notifyEstimateReady(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = estimateEmailSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Select a valid job estimate.");
  const input = parsed.data;
  await jobManager(user.uid, input.companyId, input.branchId);
  const job = await db.doc(`jobSheets/${input.jobId}`).get();
  if (
    !job.exists ||
    job.get("companyId") !== input.companyId ||
    job.get("branchId") !== input.branchId
  )
    throw new ApiError(404, "Job card not found.");
  if (job.get("approvalStatus") !== "sent")
    throw new ApiError(409, "Mark the estimate as sent before emailing the customer.");
  const revision = Number(job.get("estimateRevision") ?? 1),
    total = Number(job.get("estimateTotal") ?? 0);
  queueCustomerEventEmail({
    companyId: input.companyId,
    customerId: String(job.get("customerId")),
    eventKey: `${input.jobId}_estimate_${revision}`,
    eyebrow: revision > 1 ? "Estimate Revision" : "Service Estimate",
    title: revision > 1 ? "Revised estimate is ready" : "Your estimate is ready",
    message: "Please review the workshop estimate and confirm your approval before work continues.",
    details: [
      { label: "Job Number", value: String(job.get("jobNumber") ?? "") },
      { label: "Vehicle", value: String(job.get("registrationNumber") ?? "") },
      { label: "Estimate", value: formatRupees(total) },
    ],
  });
  return { queued: true };
}
async function createJobRevision(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = jobRevisionSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter a reason for this revision.");
  const input = parsed.data;
  await teamManager(user.uid, input.companyId, input.branchId);
  const jobRef = db.doc(`jobSheets/${input.jobId}`),
    invoiceRef = db.doc(`invoices/${input.jobId}`),
    [job, invoice] = await Promise.all([jobRef.get(), invoiceRef.get()]);
  if (
    !job.exists ||
    job.get("companyId") !== input.companyId ||
    job.get("branchId") !== input.branchId
  )
    throw new ApiError(404, "Job card not found in this branch.");
  if (invoice.exists)
    throw new ApiError(
      409,
      "An issued invoice cannot be revised. Create a new job for extra work.",
    );
  if (!["approved", "in_progress", "quality_check", "ready"].includes(String(job.get("status"))))
    throw new ApiError(409, "A revision is available after approval and before invoicing.");
  const now = FieldValue.serverTimestamp();
  await jobRef.update({
    approvalStatus: "draft",
    estimateLocked: false,
    estimateRevision: FieldValue.increment(1),
    status: "estimate_pending",
    assignedTechnicianIds: [],
    revisionReason: input.reason.trim(),
    revisionCreatedAt: now,
    revisionCreatedBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  return { revised: true, status: "estimate_pending" };
}
async function listTeam(user: DecodedIdToken, companyId: string, branchId: string) {
  await teamManager(user.uid, companyId, branchId);
  const members = await db.collection("memberships").where("companyId", "==", companyId).get();
  return {
    members: await Promise.all(
      members.docs
        .filter((item) => item.get("status") !== "deleted")
        .map(async (item) => {
          const data = item.data(),
            profile = await db.doc(`users/${String(data.userId)}`).get();
          return {
            id: item.id,
            userId: data.userId,
            displayName: profile.get("displayName") ?? "Team Member",
            email: profile.get("email") ?? "",
            status: data.status,
            companyRoles: data.companyRoles ?? [],
            branchAssignments: data.branchAssignments ?? [],
          };
        }),
    ),
  };
}
async function assignTeam(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = assignmentSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Invalid role assignment.");
  const { companyId, userId, branchId, roles } = parsed.data,
    authority = await teamManager(user.uid, companyId, branchId);
  if (!authority.owner && roles.includes("branch_manager"))
    throw new ApiError(403, "Only an Owner can assign a Branch Manager.");
  const ref = db.doc(`memberships/${userId}_${companyId}`),
    snapshot = await ref.get();
  if (!snapshot.exists) throw new ApiError(404, "The user does not have a company membership.");
  const current =
      (snapshot.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    next = [...current.filter((item) => item.branchId !== branchId), { branchId, roles }],
    branchIds = [...new Set(next.map((item) => item.branchId))],
    branchRoleKeys = [...new Set(next.flatMap((item) => item.roles))];
  await ref.update({
    branchAssignments: next,
    branchIds,
    branchRoleKeys,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  });
  return { updated: true, userId, branchId, roles };
}
async function createStaff(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = createStaffSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid staff details.");
  const { companyId, branchId, displayName, email, temporaryPassword, role } = parsed.data,
    authority = await teamManager(user.uid, companyId, branchId);
  if (!authority.owner && role === "branch_manager")
    throw new ApiError(403, "Only an Owner can create a Branch Manager.");
  let created;
  try {
    created = await auth.createUser({
      displayName,
      email: email.toLowerCase(),
      password: temporaryPassword,
    });
  } catch {
    throw new ApiError(409, "This email already exists or cannot be created.");
  }
  const now = FieldValue.serverTimestamp(),
    batch = db.batch();
  batch.set(db.doc(`users/${created.uid}`), {
    displayName,
    email: email.toLowerCase(),
    platformRoles: [],
    status: "active",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  batch.set(db.doc(`memberships/${created.uid}_${companyId}`), {
    userId: created.uid,
    companyId,
    companyRoles: [],
    branchIds: [branchId],
    branchAssignments: [{ branchId, roles: [role] }],
    branchRoleKeys: [role],
    status: "active",
    createdAt: now,
    createdBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  await batch.commit();
  return { created: true };
}
async function changeStaffStatus(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = staffStatusSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Select a valid staff action.");
  const { companyId, branchId, userId, action } = parsed.data,
    authority = await teamManager(user.uid, companyId, branchId);
  if (!authority.owner) throw new ApiError(403, "Only an Owner can change staff login access.");
  if (userId === user.uid) throw new ApiError(409, "You cannot change your own login access.");
  const membershipRef = db.doc(`memberships/${userId}_${companyId}`),
    membership = await membershipRef.get();
  if (!membership.exists) throw new ApiError(404, "Staff membership not found.");
  if (((membership.get("companyRoles") as string[] | undefined) ?? []).length)
    throw new ApiError(409, "Owner and company administrator access cannot be changed here.");
  const now = FieldValue.serverTimestamp();
  if (action === "delete") {
    try {
      await auth.deleteUser(userId);
    } catch (reason) {
      if ((reason as { code?: string }).code !== "auth/user-not-found") throw reason;
    }
    await membershipRef.update({
      status: "deleted",
      branchIds: [],
      branchAssignments: [],
      branchRoleKeys: [],
      updatedAt: now,
      updatedBy: user.uid,
    });
    await db
      .doc(`users/${userId}`)
      .set({ status: "deleted", updatedAt: now, updatedBy: user.uid }, { merge: true });
    return { updated: true, action };
  }
  await auth.updateUser(userId, { disabled: action === "disable" });
  await membershipRef.update({
    status: action === "disable" ? "disabled" : "active",
    updatedAt: now,
    updatedBy: user.uid,
  });
  await db
    .doc(`users/${userId}`)
    .set(
      { status: action === "disable" ? "disabled" : "active", updatedAt: now, updatedBy: user.uid },
      { merge: true },
    );
  return { updated: true, action };
}
async function assignedJobs(user: DecodedIdToken, companyId: string, branchId: string) {
  await requireActiveSubscription(companyId, branchId);
  const member = await db.doc(`memberships/${user.uid}_${companyId}`).get(),
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    branchIds = (member.get("branchIds") as string[] | undefined) ?? [],
    branchRoleKeys = (member.get("branchRoleKeys") as string[] | undefined) ?? [],
    technician =
      assignments.some((item) => item.branchId === branchId && item.roles.includes("technician")) ||
      (branchIds.includes(branchId) && branchRoleKeys.includes("technician"));
  if (!member.exists || member.get("status") !== "active" || !technician)
    throw new ApiError(403, "Technician access is required.");
  const jobs = await db
    .collection("jobSheets")
    .where("assignedTechnicianIds", "array-contains", user.uid)
    .get();
  return {
    jobs: jobs.docs
      .filter((item) => item.get("companyId") === companyId && item.get("branchId") === branchId)
      .map((item) => ({ id: item.id, ...item.data() })),
  };
}

async function pendingPayments(user: DecodedIdToken, companyId: string, branchId: string) {
  await financeManager(user.uid, companyId, branchId);
  const invoices = await db
    .collection("invoices")
    .where("companyId", "==", companyId)
    .where("branchId", "==", branchId)
    .get();
  const pending = invoices.docs.filter(
    (item) => item.get("status") !== "void" && Number(item.get("balanceAmount") ?? 0) > 0.001,
  );
  const customerIds = [
    ...new Set(pending.map((item) => String(item.get("customerId") ?? "")).filter(Boolean)),
  ];
  const customerDocs = await Promise.all(customerIds.map((id) => db.doc(`customers/${id}`).get()));
  const phones = new Map(
    customerDocs
      .filter((item) => item.exists)
      .map((item) => [item.id, String(item.get("phone") ?? "")]),
  );
  return {
    pending: pending
      .map((item) => ({
        id: item.id,
        invoiceNumber: String(item.get("invoiceNumber") ?? item.id),
        jobNumber: String(item.get("jobNumber") ?? ""),
        customerName: String(item.get("customerName") ?? "Customer"),
        phone: phones.get(String(item.get("customerId") ?? "")) ?? "",
        totalAmount: Number(item.get("totalAmount") ?? 0),
        paidAmount: Number(item.get("paidAmount") ?? 0),
        balanceAmount: Number(item.get("balanceAmount") ?? 0),
      }))
      .sort((a, b) => b.balanceAmount - a.balanceAmount),
  };
}
async function listNotifications(user: DecodedIdToken, companyId: string, branchId: string) {
  await requireActiveSubscription(companyId, branchId);
  const member = await db.doc(`memberships/${user.uid}_${companyId}`).get(),
    companyRoles = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    manager =
      companyRoles.some((role) => ["company_owner", "company_admin"].includes(role)) ||
      assignments.some(
        (item) => item.branchId === branchId && item.roles.includes("branch_manager"),
      );
  if (!member.exists || member.get("status") !== "active")
    throw new ApiError(403, "No active company membership.");
  const snapshot = await db.collection("notifications").where("companyId", "==", companyId).get();
  return {
    notifications: snapshot.docs
      .filter(
        (item) =>
          item.get("branchId") === branchId &&
          !((item.get("readBy") as string[] | undefined) ?? []).includes(user.uid) &&
          (item.get("recipientUserId") === user.uid ||
            (manager && item.get("audience") === "management")),
      )
      .map((item) => ({
        id: item.id,
        ...item.data(),
        createdAtSeconds: Number(item.get("createdAt")?._seconds ?? 0),
      }))
      .sort((a, b) => b.createdAtSeconds - a.createdAtSeconds)
      .slice(0, 20),
  };
}
async function createNotification(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = notificationSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Invalid notification.");
  const input = parsed.data;
  await requireActiveSubscription(input.companyId, input.branchId);
  const member = await db.doc(`memberships/${user.uid}_${input.companyId}`).get(),
    companyRoles = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    manager =
      companyRoles.some((role) => ["company_owner", "company_admin"].includes(role)) ||
      assignments.some(
        (item) => item.branchId === input.branchId && item.roles.includes("branch_manager"),
      ),
    technician = assignments.some(
      (item) => item.branchId === input.branchId && item.roles.includes("technician"),
    ),
    job = await db.doc(`jobSheets/${input.jobId}`).get();
  if (!member.exists || member.get("status") !== "active" || !job.exists)
    throw new ApiError(403, "Notification access is required.");
  if (job.get("companyId") !== input.companyId || job.get("branchId") !== input.branchId)
    throw new ApiError(400, "Job does not match this workspace.");
  if (input.type === "job_assigned" && (!manager || !input.recipientUserId))
    throw new ApiError(403, "Job assignment access is required.");
  if (
    input.type === "delay_reported" &&
    (!technician || !(job.get("assignedTechnicianIds") as string[]).includes(user.uid))
  )
    throw new ApiError(403, "Assigned technician access is required.");
  const now = FieldValue.serverTimestamp();
  await db.collection("notifications").add({
    companyId: input.companyId,
    branchId: input.branchId,
    jobId: input.jobId,
    type: input.type,
    message: input.message,
    recipientUserId: input.recipientUserId ?? null,
    audience: input.type === "delay_reported" ? "management" : "user",
    createdAt: now,
    createdBy: user.uid,
  });
  return { created: true };
}
async function markNotificationRead(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = notificationReadSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Invalid notification.");
  const input = parsed.data,
    member = await db.doc(`memberships/${user.uid}_${input.companyId}`).get(),
    notificationRef = db.doc(`notifications/${input.notificationId}`),
    notification = await notificationRef.get();
  if (!member.exists || member.get("status") !== "active")
    throw new ApiError(403, "No active company membership.");
  if (
    !notification.exists ||
    notification.get("companyId") !== input.companyId ||
    notification.get("branchId") !== input.branchId
  )
    throw new ApiError(404, "Notification not found.");
  const companyRoles = (member.get("companyRoles") as string[] | undefined) ?? [],
    assignments =
      (member.get("branchAssignments") as { branchId: string; roles: string[] }[] | undefined) ??
      [],
    management =
      companyRoles.some((role) => ["company_owner", "company_admin"].includes(role)) ||
      assignments.some(
        (assignment) =>
          assignment.branchId === input.branchId && assignment.roles.includes("branch_manager"),
      ),
    addressedToUser = notification.get("recipientUserId") === user.uid,
    addressedToManagement = notification.get("audience") === "management" && management;
  if (!addressedToUser && !addressedToManagement)
    throw new ApiError(403, "Notification access is required.");
  await notificationRef.update({
    readBy: FieldValue.arrayUnion(user.uid),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  });
  return { read: true };
}

async function markPaymentFollowUp(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = paymentFollowUpSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Invalid payment follow-up.");
  const input = parsed.data;
  await financeManager(user.uid, input.companyId, input.branchId);
  const invoiceRef = db.doc(`invoices/${input.invoiceId}`),
    invoice = await invoiceRef.get();
  if (
    !invoice.exists ||
    invoice.get("companyId") !== input.companyId ||
    invoice.get("branchId") !== input.branchId
  )
    throw new ApiError(404, "Invoice not found.");
  if (Number(invoice.get("balanceAmount") ?? 0) <= 0)
    throw new ApiError(409, "This invoice is already paid.");
  const now = FieldValue.serverTimestamp();
  await invoiceRef.update({
    paymentFollowedUpAt: now,
    paymentFollowedUpBy: user.uid,
    updatedAt: now,
    updatedBy: user.uid,
  });
  return { followedUp: true };
}
async function reversePayment(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = reversePaymentSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter a valid reversal reason.");
  const { companyId, branchId, paymentId, reason } = parsed.data;
  await financeManager(user.uid, companyId, branchId);
  const paymentRef = db.doc(`payments/${paymentId}`);
  return db.runTransaction(async (transaction) => {
    const payment = await transaction.get(paymentRef);
    if (
      !payment.exists ||
      payment.get("companyId") !== companyId ||
      payment.get("branchId") !== branchId
    )
      throw new ApiError(404, "Payment not found.");
    if (payment.get("status") !== "completed")
      throw new ApiError(409, "Payment has already been reversed.");
    const invoiceRef = db.doc(`invoices/${String(payment.get("invoiceId"))}`),
      invoice = await transaction.get(invoiceRef);
    if (!invoice.exists) throw new ApiError(404, "Invoice not found.");
    const amount = Number(payment.get("amount")),
      paid = Math.max(0, Number(invoice.get("paidAmount")) - amount),
      total = Number(invoice.get("totalAmount")),
      balance = Math.max(0, total - paid),
      now = FieldValue.serverTimestamp();
    transaction.update(paymentRef, {
      status: "reversed",
      reversalReason: reason,
      reversedAt: now,
      reversedBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
    transaction.update(invoiceRef, {
      paidAmount: paid,
      balanceAmount: balance,
      status: paid <= 0.001 ? "issued" : "part_paid",
      updatedAt: now,
      updatedBy: user.uid,
    });
    return { reversed: true, paymentId, balanceAmount: balance };
  });
}

async function recordInvoicePayment(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = recordPaymentSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid payment details.");
  const input = parsed.data;
  await financeManager(user.uid, input.companyId, input.branchId);
  const invoiceRef = db.doc(`invoices/${input.invoiceId}`),
    paymentRef = db.collection("payments").doc(),
    today = new Date(),
    startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1,
    financialYear = `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`,
    sequenceRef = db.doc(`receiptSequences/${input.companyId}_${financialYear}`);
  const result = await db.runTransaction(async (transaction) => {
    const [invoice, sequence] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(sequenceRef),
    ]);
    if (
      !invoice.exists ||
      invoice.get("companyId") !== input.companyId ||
      invoice.get("branchId") !== input.branchId
    )
      throw new ApiError(404, "Invoice not found.");
    if (invoice.get("status") === "void") throw new ApiError(409, "A void invoice cannot be paid.");
    const balance = Number(invoice.get("balanceAmount") ?? 0),
      paid = Number(invoice.get("paidAmount") ?? 0);
    if (input.amount > balance + 0.001)
      throw new ApiError(409, "Payment exceeds the latest invoice balance.");
    const serial = sequence.exists ? Number(sequence.get("lastNumber") ?? 0) + 1 : 1,
      receiptNumber = `RCPT/${financialYear}/${String(serial).padStart(6, "0")}`,
      nextPaid = paid + input.amount,
      nextBalance = Math.max(0, balance - input.amount),
      now = FieldValue.serverTimestamp();
    transaction.set(
      sequenceRef,
      {
        companyId: input.companyId,
        financialYear,
        lastNumber: serial,
        ...(sequence.exists ? {} : { createdAt: now, createdBy: user.uid }),
        updatedAt: now,
        updatedBy: user.uid,
      },
      { merge: true },
    );
    transaction.update(invoiceRef, {
      paidAmount: nextPaid,
      balanceAmount: nextBalance,
      status: nextBalance <= 0.001 ? "paid" : "part_paid",
      updatedAt: now,
      updatedBy: user.uid,
    });
    transaction.create(paymentRef, {
      companyId: input.companyId,
      branchId: input.branchId,
      invoiceId: invoice.id,
      jobId: String(invoice.get("jobId") ?? ""),
      receiptNumber,
      amount: input.amount,
      method: input.method,
      reference: input.reference.trim(),
      notes: input.notes.trim(),
      receivedAt: now,
      status: "completed",
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
    return {
      recorded: true,
      paymentId: paymentRef.id,
      receiptNumber,
      customerId: String(invoice.get("customerId") ?? "walk-in"),
      invoiceNumber: String(invoice.get("invoiceNumber") ?? ""),
      balanceAmount: nextBalance,
    };
  });
  queueCustomerEventEmail({
    companyId: input.companyId,
    customerId: result.customerId,
    eventKey: `${result.paymentId}_payment_received`,
    eyebrow: "Payment Received",
    title: "Payment received",
    message: "Thank you. Your payment has been recorded successfully.",
    details: [
      { label: "Receipt Number", value: result.receiptNumber },
      { label: "Invoice Number", value: result.invoiceNumber },
      { label: "Amount Received", value: formatRupees(input.amount) },
      { label: "Balance", value: formatRupees(result.balanceAmount) },
    ],
  });
  return {
    recorded: result.recorded,
    paymentId: result.paymentId,
    receiptNumber: result.receiptNumber,
  };
}

async function correctPayment(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = correctPaymentSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter a valid payment correction.");
  const { companyId, branchId, paymentId, amount, method, reference, notes, reason } = parsed.data;
  await financeManager(user.uid, companyId, branchId);
  const paymentRef = db.doc(`payments/${paymentId}`);
  return db.runTransaction(async (transaction) => {
    const payment = await transaction.get(paymentRef);
    if (
      !payment.exists ||
      payment.get("companyId") !== companyId ||
      payment.get("branchId") !== branchId
    )
      throw new ApiError(404, "Payment not found.");
    if (payment.get("status") !== "completed")
      throw new ApiError(409, "A reversed payment cannot be edited.");
    const invoiceRef = db.doc(`invoices/${String(payment.get("invoiceId"))}`),
      invoice = await transaction.get(invoiceRef);
    if (!invoice.exists) throw new ApiError(404, "Invoice not found.");
    const previousAmount = Number(payment.get("amount")),
      total = Number(invoice.get("totalAmount")),
      paidWithoutThisPayment = Math.max(0, Number(invoice.get("paidAmount")) - previousAmount);
    if (amount > total - paidWithoutThisPayment + 0.001)
      throw new ApiError(409, "Corrected payment cannot exceed the remaining invoice amount.");
    const paid = paidWithoutThisPayment + amount,
      balance = Math.max(0, total - paid),
      now = FieldValue.serverTimestamp();
    transaction.update(paymentRef, {
      amount,
      method,
      reference: reference.trim(),
      notes: notes.trim(),
      correctionReason: reason.trim(),
      correctedAt: now,
      correctedBy: user.uid,
      correctionHistory: FieldValue.arrayUnion({
        previousAmount,
        previousMethod: payment.get("method"),
        previousReference: payment.get("reference") ?? "",
        previousNotes: payment.get("notes") ?? "",
        reason: reason.trim(),
        correctedAt: Timestamp.now(),
        correctedBy: user.uid,
      }),
      updatedAt: now,
      updatedBy: user.uid,
    });
    transaction.update(invoiceRef, {
      paidAmount: paid,
      balanceAmount: balance,
      status: balance <= 0.001 ? "paid" : paid > 0.001 ? "part_paid" : "issued",
      updatedAt: now,
      updatedBy: user.uid,
    });
    return { corrected: true, paymentId, paidAmount: paid, balanceAmount: balance };
  });
}

async function recordSupplierPayment(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = supplierPaymentSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter valid supplier payment details.");
  const { companyId, branchId, purchaseId, amount, method, reference, notes } = parsed.data;
  await financeManager(user.uid, companyId, branchId);
  const purchaseRef = db.doc(`purchaseBills/${purchaseId}`),
    paymentRef = db.collection("purchasePayments").doc();
  return db.runTransaction(async (transaction) => {
    const purchase = await transaction.get(purchaseRef);
    if (
      !purchase.exists ||
      purchase.get("companyId") !== companyId ||
      purchase.get("branchId") !== branchId
    )
      throw new ApiError(404, "Purchase bill not found.");
    const total = Number(purchase.get("totalAmount") ?? 0),
      previousPaid =
        purchase.get("paymentStatus") === "paid" ? total : Number(purchase.get("paidAmount") ?? 0),
      balanceBefore = Math.max(0, total - previousPaid);
    if (amount > balanceBefore + 0.001)
      throw new ApiError(409, "Supplier payment cannot exceed the outstanding bill balance.");
    const paid = previousPaid + amount,
      balance = Math.max(0, total - paid),
      status = balance <= 0.001 ? "paid" : "part_paid",
      now = FieldValue.serverTimestamp(),
      date = new Date().toISOString().slice(2, 10).replaceAll("-", ""),
      paymentNumber = `SP-${date}-${paymentRef.id.slice(0, 5).toUpperCase()}`;
    transaction.create(paymentRef, {
      companyId,
      branchId,
      purchaseId,
      supplierId: String(purchase.get("supplierId") ?? ""),
      supplierName: String(purchase.get("supplierName") ?? "Supplier"),
      billNumber: String(purchase.get("billNumber") ?? ""),
      paymentNumber,
      amount,
      method,
      reference: reference.trim(),
      notes: notes.trim(),
      paidAt: now,
      status: "completed",
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
    });
    transaction.update(purchaseRef, {
      paidAmount: paid,
      balanceAmount: balance,
      paymentStatus: status,
      lastPaidAt: now,
      updatedAt: now,
      updatedBy: user.uid,
    });
    return {
      recorded: true,
      paymentId: paymentRef.id,
      paymentNumber,
      paidAmount: paid,
      balanceAmount: balance,
    };
  });
}

async function configure(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await superAdmin(user.uid)))
    throw new ApiError(403, "Platform Super Admin access is required.");
  const parsed = configureSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Invalid credential configuration.");
  const { companyId, channel, authKey, integratedNumber } = parsed.data;
  if (channel === "whatsapp" && !integratedNumber)
    throw new ApiError(400, "WhatsApp integrated number is required.");
  const credential: Credential = {
    provider: "msg91",
    authKey: encrypt(authKey),
    ...(integratedNumber ? { integratedNumber: encrypt(integratedNumber) } : {}),
  };
  await Promise.all([
    db.doc(`communicationCredentials/${companyId}_${channel}`).set(
      {
        ...credential,
        companyId,
        channel,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    ),
    db.doc(`communicationEntitlements/${companyId}`).set(
      {
        [`${channel}CredentialConfigured`]: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    ),
  ]);
  return { configured: true, companyId, channel };
}
function escapeEmailHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function brandedEmailTemplate(input: {
  brand: string;
  eyebrow: string;
  title: string;
  message: string;
  details?: { label: string; value: string }[];
  footer?: string;
}) {
  const brand = escapeEmailHtml(input.brand),
    details = (input.details ?? [])
      .map(
        ({ label, value }) => `
          <tr>
            <td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;color:#687386;font-size:13px;">${escapeEmailHtml(label)}</td>
            <td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;color:#111820;font-size:14px;font-weight:700;text-align:right;">${escapeEmailHtml(value)}</td>
          </tr>`,
      )
      .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeEmailHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef1f4;font-family:Arial,Helvetica,sans-serif;color:#111820;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeEmailHtml(input.message)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f4;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dce1e6;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,32,.08);">
            <tr>
              <td style="padding:22px 28px;background:#0b1118;border-bottom:4px solid #e63236;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.02em;">${brand}</td>
                    <td align="right"><span style="display:inline-block;padding:7px 11px;border:1px solid #39434d;border-radius:999px;color:#f2f4f6;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Car Care</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 28px 18px;">
                <div style="margin-bottom:10px;color:#e63236;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">${escapeEmailHtml(input.eyebrow)}</div>
                <h1 style="margin:0;color:#111820;font-size:28px;line-height:1.2;">${escapeEmailHtml(input.title)}</h1>
                <p style="margin:16px 0 0;color:#556170;font-size:16px;line-height:1.65;">${escapeEmailHtml(input.message)}</p>
              </td>
            </tr>
            ${
              details
                ? `<tr><td style="padding:10px 28px 26px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e1e5e9;border-radius:12px;overflow:hidden;background:#f8fafb;">${details}</table></td></tr>`
                : ""
            }
            <tr>
              <td style="padding:20px 28px;background:#f4f6f8;border-top:1px solid #e1e5e9;color:#76818d;font-size:12px;line-height:1.6;">
                ${escapeEmailHtml(input.footer ?? `This notification was sent by ${input.brand}.`)}<br>
                <span style="color:#a0a8b1;">Powered by Digital Viyabari</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
function formatRupees(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}
type CustomerEventEmail = {
  companyId: string;
  customerId: string;
  eventKey: string;
  eyebrow: string;
  title: string;
  message: string;
  details?: { label: string; value: string }[];
};
function queueCustomerEventEmail(input: CustomerEventEmail) {
  void sendCustomerEventEmail(input).catch((reason) =>
    process.stderr.write(
      `Customer email ${input.eventKey}: ${reason instanceof Error ? reason.message : "failed"}\n`,
    ),
  );
}
async function sendCustomerEventEmail(input: CustomerEventEmail) {
  const password = process.env.SMTP_PASSWORD;
  if (!password || !input.customerId || input.customerId === "walk-in") return "skipped";
  const deliveryId = `${input.companyId}_${input.eventKey}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const deliveryRef = db.doc(`customerEmailDeliveries/${deliveryId}`);
  const [existing, customer, company, entitlement] = await Promise.all([
    deliveryRef.get(),
    db.doc(`customers/${input.customerId}`).get(),
    db.doc(`companies/${input.companyId}`).get(),
    db.doc(`communicationEntitlements/${input.companyId}`).get(),
  ]);
  if (existing.exists && ["processing", "sent"].includes(String(existing.get("status"))))
    return "duplicate";
  if (!customer.exists || customer.get("companyId") !== input.companyId) return "skipped";
  if (entitlement.exists && entitlement.get("emailEnabled") === false) return "disabled";
  const recipient = String(customer.get("email") ?? "").trim();
  if (!recipient || !recipient.includes("@")) return "no_email";
  const workshop = String(company.get("name") ?? "Digital Viyabari");
  await deliveryRef.set(
    {
      companyId: input.companyId,
      customerId: input.customerId,
      eventKey: input.eventKey,
      recipient,
      status: "processing",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "customer_email_worker",
      ...(existing.exists
        ? {}
        : { createdAt: FieldValue.serverTimestamp(), createdBy: "customer_email_worker" }),
    },
    { merge: true },
  );
  try {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.hostinger.com",
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: true,
        auth: {
          user: process.env.SMTP_USER ?? "noreply@digitalviyabari.com",
          pass: password,
        },
      }),
      sent = await transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME ?? "Digital Viyabari"}" <${process.env.SMTP_USER ?? "noreply@digitalviyabari.com"}>`,
        to: recipient,
        subject: `${workshop}: ${input.title}`,
        text: `${input.title}\n\n${input.message}\n\n${(input.details ?? []).map(({ label, value }) => `${label}: ${value}`).join("\n")}`,
        html: brandedEmailTemplate({
          brand: workshop,
          eyebrow: input.eyebrow,
          title: input.title,
          message: input.message,
          details: input.details,
          footer: `This service update was sent by ${workshop}.`,
        }),
      });
    await deliveryRef.update({
      status: "sent",
      providerMessageId: sent.messageId,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "sent";
  } catch (reason) {
    await deliveryRef.update({
      status: "failed",
      failureReason: reason instanceof Error ? reason.message.slice(0, 300) : "Email failed.",
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw reason;
  }
}
async function sendTestEmail(request: IncomingMessage, user: DecodedIdToken) {
  if (!(await superAdmin(user.uid)))
    throw new ApiError(403, "Platform Super Admin access is required.");
  const parsed = testEmailSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Enter a valid test email address.");
  const password = process.env.SMTP_PASSWORD;
  if (!password) throw new ApiError(503, "SMTP password is not configured on the VPS.");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER ?? "noreply@digitalviyabari.com",
      pass: password,
    },
  });
  const sent = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME ?? "Digital Viyabari"}" <${process.env.SMTP_USER ?? "noreply@digitalviyabari.com"}>`,
    to: parsed.data.recipient,
    subject: "Digital Viyabari Email Test",
    text: "Your Digital Viyabari production email notification connection is working correctly.",
    html: brandedEmailTemplate({
      brand: "Digital Viyabari",
      eyebrow: "Production Email Test",
      title: "Email connection successful",
      message: "Your production email notification connection is working correctly.",
      details: [
        { label: "Sender", value: process.env.SMTP_USER ?? "noreply@digitalviyabari.com" },
        { label: "Delivery", value: "Hostinger SMTP" },
        { label: "Status", value: "Connected" },
      ],
      footer: "This test confirms that Digital Viyabari can send branded workshop notifications.",
    }),
  });
  await db.collection("platformAuditLogs").add({
    action: "test_email_sent",
    actorUserId: user.uid,
    recipient: parsed.data.recipient,
    providerMessageId: sent.messageId,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { sent: true, recipient: parsed.data.recipient };
}

async function send(request: IncomingMessage, user: DecodedIdToken) {
  const parsed = sendSchema.safeParse(await body(request));
  if (!parsed.success) throw new ApiError(400, "Invalid communication request.");
  const input = parsed.data;
  await sender(user.uid, input.companyId, input.branchId);
  const credentialDoc = await db
    .doc(`communicationCredentials/${input.companyId}_${input.channel}`)
    .get();
  if (!credentialDoc.exists) throw new ApiError(409, "Provider credentials are not configured.");
  const ledger = db.doc(`communicationLedger/${input.companyId}_${input.idempotencyKey}`),
    entitlement = db.doc(`communicationEntitlements/${input.companyId}`);
  const reservation = await db.runTransaction(async (transaction) => {
    const [prior, plan] = await Promise.all([
      transaction.get(ledger),
      transaction.get(entitlement),
    ]);
    if (prior.exists) return { duplicate: true, status: String(prior.get("status")), rate: 0 };
    if (
      !plan.exists ||
      plan.get("status") !== "active" ||
      plan.get(`${input.channel}Enabled`) !== true
    )
      throw new ApiError(409, `${input.channel.toUpperCase()} is not enabled.`);
    const creditField = `${input.channel}Credits`,
      rate = Number(plan.get(`${input.channel}UnitRate`) ?? 0),
      credits = Number(plan.get(creditField) ?? 0);
    if (credits < 1)
      throw new ApiError(402, `${input.channel.toUpperCase()} credits are exhausted.`);
    transaction.update(entitlement, {
      [creditField]: credits - 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });
    transaction.create(ledger, {
      companyId: input.companyId,
      branchId: input.branchId,
      channel: input.channel,
      type: "usage",
      units: 1,
      amount: rate,
      balanceAfter: credits - 1,
      description: input.description,
      referenceId: input.idempotencyKey,
      recipientMasked: `******${input.recipient.slice(-4)}`,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    });
    return { duplicate: false, status: "pending", rate };
  });
  if (reservation.duplicate) return reservation;
  const credential = credentialDoc.data() as Credential;
  let provider: { messageId: string; summary: string };
  try {
    provider = await sendMsg91(
      input,
      decrypt(credential.authKey),
      credential.integratedNumber ? decrypt(credential.integratedNumber) : undefined,
    );
  } catch (reason) {
    await db.runTransaction(async (transaction) => {
      const [current, plan] = await Promise.all([
        transaction.get(ledger),
        transaction.get(entitlement),
      ]);
      if (!current.exists || current.get("status") !== "pending" || !plan.exists) return;
      const field = `${input.channel}Credits`,
        credits = Number(plan.get(field) ?? 0);
      transaction.update(entitlement, {
        [field]: credits + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "system_refund",
      });
      transaction.update(ledger, {
        status: "failed",
        failureReason:
          reason instanceof Error ? reason.message.slice(0, 300) : "Provider rejected request.",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "system_refund",
      });
      transaction.create(db.collection("communicationLedger").doc(), {
        companyId: input.companyId,
        branchId: input.branchId,
        channel: input.channel,
        type: "refund",
        units: 1,
        amount: reservation.rate,
        balanceAfter: credits + 1,
        description: `Automatic Refund: ${input.description}`,
        referenceId: input.idempotencyKey,
        status: "completed",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "system_refund",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "system_refund",
      });
    });
    throw new ApiError(503, "Provider could not send the message. The credit was refunded.");
  }
  await ledger.update({
    status: "completed",
    providerMessageId: provider.messageId,
    providerResponse: provider.summary,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  });
  return { duplicate: false, status: "completed", referenceId: input.idempotencyKey };
}

async function sendMsg91(
  input: z.infer<typeof sendSchema>,
  authKey: string,
  integratedNumber?: string,
) {
  const sms = input.channel === "sms",
    url = sms
      ? "https://control.msg91.com/api/v5/flow"
      : "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
    payload = sms
      ? {
          template_id: input.templateId,
          short_url: "0",
          realTimeResponse: "1",
          recipients: [{ mobiles: input.recipient, ...input.variables }],
        }
      : {
          integrated_number: integratedNumber,
          content_type: "template",
          payload: {
            to_and_components: [{ to: [input.recipient], components: input.variables }],
            template: {
              name: input.templateId,
              language: { code: input.languageCode, policy: "deterministic" },
            },
          },
        };
  const response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", authkey: authKey, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    }),
    text = await response.text();
  if (!response.ok) throw new Error(`MSG91 ${response.status}: ${text.slice(0, 180)}`);
  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    result = { response: text };
  }
  return {
    messageId: String(result.request_id ?? result.message_id ?? result.id ?? "accepted"),
    summary: JSON.stringify(result).slice(0, 600),
  };
}

function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function dateDifference(expiry: string, today: string) {
  return Math.round(
    (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}
function customerMobile(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}
async function automatedPaidReminder(
  channel: "sms" | "whatsapp",
  companyId: string,
  branchId: string,
  recipient: string,
  idempotencyKey: string,
  variables: Record<string, string>,
) {
  const templateId =
    channel === "sms"
      ? process.env.INSURANCE_SMS_TEMPLATE_ID
      : process.env.INSURANCE_WHATSAPP_TEMPLATE_ID;
  if (!templateId || recipient.length < 10) return "not_configured";
  const entitlementRef = db.doc(`communicationEntitlements/${companyId}`),
    credentialRef = db.doc(`communicationCredentials/${companyId}_${channel}`),
    ledgerRef = db.doc(`communicationLedger/${companyId}_${idempotencyKey}`),
    [entitlement, credential] = await Promise.all([entitlementRef.get(), credentialRef.get()]);
  if (
    !entitlement.exists ||
    entitlement.get("status") !== "active" ||
    entitlement.get(`${channel}Enabled`) !== true ||
    !credential.exists
  )
    return "disabled";
  const reserved = await db.runTransaction(async (transaction) => {
    const [plan, prior] = await Promise.all([
      transaction.get(entitlementRef),
      transaction.get(ledgerRef),
    ]);
    if (prior.exists) return false;
    const creditField = `${channel}Credits`,
      credits = Number(plan.get(creditField) ?? 0),
      rate = Number(plan.get(`${channel}UnitRate`) ?? 0);
    if (credits < 1) return false;
    transaction.update(entitlementRef, {
      [creditField]: credits - 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "insurance_worker",
    });
    transaction.create(ledgerRef, {
      companyId,
      branchId,
      channel,
      type: "usage",
      units: 1,
      amount: rate,
      balanceAfter: credits - 1,
      description: "Vehicle insurance expiry reminder",
      referenceId: idempotencyKey,
      recipientMasked: `******${recipient.slice(-4)}`,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "insurance_worker",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "insurance_worker",
    });
    return true;
  });
  if (!reserved) return "no_credit_or_duplicate";
  const data = credential.data() as Credential;
  try {
    const result = await sendMsg91(
      {
        companyId,
        branchId,
        channel,
        recipient,
        templateId,
        languageCode: "en",
        variables,
        idempotencyKey,
        description: "Vehicle insurance expiry reminder",
      },
      decrypt(data.authKey),
      data.integratedNumber ? decrypt(data.integratedNumber) : undefined,
    );
    await ledgerRef.update({
      status: "completed",
      providerMessageId: result.messageId,
      providerResponse: result.summary,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "insurance_worker",
    });
    return "sent";
  } catch (reason) {
    await db.runTransaction(async (transaction) => {
      const plan = await transaction.get(entitlementRef),
        field = `${channel}Credits`,
        credits = Number(plan.get(field) ?? 0);
      transaction.update(entitlementRef, {
        [field]: credits + 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "insurance_worker_refund",
      });
      transaction.update(ledgerRef, {
        status: "failed",
        failureReason:
          reason instanceof Error ? reason.message.slice(0, 300) : "Provider rejected reminder.",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "insurance_worker_refund",
      });
    });
    return "failed_refunded";
  }
}
async function runInsuranceReminderWorker() {
  if (!process.env.SMTP_PASSWORD) return;
  const today = indiaDate(),
    vehicles = await db.collection("vehicles").where("insuranceReminderEnabled", "==", true).get();
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER ?? "noreply@digitalviyabari.com",
      pass: process.env.SMTP_PASSWORD,
    },
  });
  for (const vehicle of vehicles.docs) {
    const expiry = String(vehicle.get("insuranceExpiryDate") ?? ""),
      difference = dateDifference(expiry, today);
    if (![3, 0, -3].includes(difference)) continue;
    const deliveryRef = db.doc(`insuranceReminderDeliveries/${vehicle.id}_${expiry}_${difference}`),
      existing = await deliveryRef.get();
    if (existing.exists) continue;
    const [customer, company] = await Promise.all([
      db.doc(`customers/${String(vehicle.get("customerId"))}`).get(),
      db.doc(`companies/${String(vehicle.get("companyId"))}`).get(),
    ]);
    if (!customer.exists || !company.exists) continue;
    const workshop = String(company.get("name") ?? "Digital Viyabari"),
      customerName = String(customer.get("name") ?? "Customer"),
      registration = String(vehicle.get("registrationNumber") ?? "your vehicle"),
      timing =
        difference === 3
          ? "expires in 3 days"
          : difference === 0
            ? "expires today"
            : "expired 3 days ago",
      message = `Dear ${customerName}, insurance for ${registration} ${timing} (${expiry}). Please renew it on time. Reminder from ${workshop}.`,
      now = FieldValue.serverTimestamp();
    await deliveryRef.create({
      companyId: vehicle.get("companyId"),
      branchId: vehicle.get("branchId"),
      vehicleId: vehicle.id,
      customerId: customer.id,
      expiryDate: expiry,
      offsetDays: difference,
      status: "processing",
      createdAt: now,
      createdBy: "insurance_worker",
      updatedAt: now,
      updatedBy: "insurance_worker",
    });
    let emailStatus = "no_email";
    if (customer.get("email")) {
      try {
        await transporter.sendMail({
          from: `"${process.env.SMTP_FROM_NAME ?? "Digital Viyabari"}" <${process.env.SMTP_USER ?? "noreply@digitalviyabari.com"}>`,
          to: String(customer.get("email")),
          subject: `${registration} insurance ${timing}`,
          text: message,
          html: brandedEmailTemplate({
            brand: workshop,
            eyebrow: "Vehicle Insurance Reminder",
            title: `Insurance ${timing}`,
            message: `Dear ${customerName}, please renew the insurance on time to keep your vehicle protected.`,
            details: [
              { label: "Vehicle", value: registration },
              { label: "Expiry Date", value: expiry },
              { label: "Reminder", value: timing },
            ],
            footer: `This helpful reminder was sent by ${workshop}.`,
          }),
        });
        emailStatus = "sent";
      } catch {
        emailStatus = "failed";
      }
    }
    const recipient = customerMobile(customer.get("phone")),
      variables = {
        customer_name: customerName,
        registration_number: registration,
        expiry_date: expiry,
        workshop_name: workshop,
        reminder_timing: timing,
      };
    const [smsStatus, whatsappStatus] = await Promise.all([
      automatedPaidReminder(
        "sms",
        String(vehicle.get("companyId")),
        String(vehicle.get("branchId")),
        recipient,
        `insurance_${vehicle.id}_${expiry}_${difference}_sms`,
        variables,
      ),
      automatedPaidReminder(
        "whatsapp",
        String(vehicle.get("companyId")),
        String(vehicle.get("branchId")),
        recipient,
        `insurance_${vehicle.id}_${expiry}_${difference}_whatsapp`,
        variables,
      ),
    ]);
    await deliveryRef.update({
      status: "completed",
      emailStatus,
      smsStatus,
      whatsappStatus,
      message,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "insurance_worker",
    });
  }
}
async function runServiceReminderWorker() {
  if (!process.env.SMTP_PASSWORD) return;
  const today = indiaDate(),
    reminders = await db.collection("serviceReminders").where("status", "==", "scheduled").get();
  for (const reminder of reminders.docs) {
    const dueAt = String(reminder.get("dueAt") ?? "");
    if (!dueAt) continue;
    const difference = dateDifference(dueAt, today);
    if (![3, 0].includes(difference)) continue;
    const timing = difference === 3 ? "due in 3 days" : "due today";
    await sendCustomerEventEmail({
      companyId: String(reminder.get("companyId")),
      customerId: String(reminder.get("customerId")),
      eventKey: `${reminder.id}_service_${difference}`,
      eyebrow: "Service Reminder",
      title: `Vehicle service ${timing}`,
      message: "A timely service helps keep your vehicle safe, reliable and efficient.",
      details: [
        { label: "Vehicle", value: String(reminder.get("registrationNumber") ?? "") },
        { label: "Service Due Date", value: dueAt },
        ...(typeof reminder.get("dueKm") === "number"
          ? [
              {
                label: "Service Due At",
                value: `${Number(reminder.get("dueKm")).toLocaleString("en-IN")} km`,
              },
            ]
          : []),
      ],
    });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/health")
      return reply(response, 200, { status: "ok", service: "dvcs-api" });
    if (!request.method || !["GET", "POST"].includes(request.method))
      throw new ApiError(405, "Method not allowed.");
    const user = await identity(request);
    enforceRateLimit(`all:${user.uid}`, 120);
    if (request.method === "POST") enforceRateLimit(`write:${user.uid}`, 30);
    if (request.method === "GET" && url.pathname === "/v1/team")
      return reply(
        response,
        200,
        await listTeam(
          user,
          url.searchParams.get("companyId") ?? "",
          url.searchParams.get("branchId") ?? "",
        ),
      );
    if (request.method === "GET" && url.pathname === "/v1/jobs/assigned")
      return reply(
        response,
        200,
        await assignedJobs(
          user,
          url.searchParams.get("companyId") ?? "",
          url.searchParams.get("branchId") ?? "",
        ),
      );
    if (request.method === "GET" && url.pathname === "/v1/payments/pending")
      return reply(
        response,
        200,
        await pendingPayments(
          user,
          url.searchParams.get("companyId") ?? "",
          url.searchParams.get("branchId") ?? "",
        ),
      );
    if (request.method === "GET" && url.pathname === "/v1/invoices/workspace")
      return reply(
        response,
        200,
        await invoiceWorkspace(
          user,
          url.searchParams.get("companyId") ?? "",
          url.searchParams.get("branchId") ?? "",
        ),
      );
    if (request.method === "GET" && url.pathname === "/v1/settings/business")
      return reply(
        response,
        200,
        await getBusinessSettings(
          user,
          url.searchParams.get("companyId") ?? "",
          url.searchParams.get("branchId") ?? "",
        ),
      );
    if (request.method === "GET" && url.pathname === "/v1/notifications")
      return reply(
        response,
        200,
        await listNotifications(
          user,
          url.searchParams.get("companyId") ?? "",
          url.searchParams.get("branchId") ?? "",
        ),
      );
    if (request.method === "GET" && url.pathname === "/v1/admin/overview")
      return reply(response, 200, await platformOverview(user));
    if (request.method === "POST" && url.pathname === "/v1/admin/create")
      return reply(response, 200, await createPlatformAdmin(request, user));
    if (request.method === "POST" && url.pathname === "/v1/admin/companies")
      return reply(response, 200, await createCompany(request, user));
    if (request.method === "POST" && url.pathname === "/v1/admin/branches")
      return reply(response, 200, await createCompanyBranch(request, user));
    if (request.method === "POST" && url.pathname === "/v1/admin/branches/access")
      return reply(response, 200, await updateBranchAccess(request, user));
    if (request.method === "POST" && url.pathname === "/v1/admin/subscriptions")
      return reply(response, 200, await updateCompanySubscription(request, user));
    if (request.method === "POST" && url.pathname === "/v1/admin/impersonate")
      return reply(response, 200, await impersonateAccount(request, user));
    if (request.method === "POST" && url.pathname === "/v1/admin/reset-password")
      return reply(response, 200, await resetAccountPassword(request, user));
    if (request.method === "POST" && url.pathname === "/v1/settings/business")
      return reply(response, 200, await saveBusinessSettings(request, user));
    if (request.method === "POST" && url.pathname === "/v1/invoices/issue")
      return reply(response, 200, await issueInvoice(request, user));
    if (request.method === "POST" && url.pathname === "/v1/invoices/amend")
      return reply(response, 200, await amendInvoice(request, user));
    if (request.method === "POST" && url.pathname === "/v1/jobs/create")
      return reply(response, 200, await createJob(request, user));
    if (request.method === "POST" && url.pathname === "/v1/jobs/status")
      return reply(response, 200, await changeJobStatus(request, user));
    if (request.method === "POST" && url.pathname === "/v1/jobs/revision")
      return reply(response, 200, await createJobRevision(request, user));
    if (request.method === "POST" && url.pathname === "/v1/jobs/estimate-email")
      return reply(response, 200, await notifyEstimateReady(request, user));
    if (request.method === "POST" && url.pathname === "/v1/notifications")
      return reply(response, 200, await createNotification(request, user));
    if (request.method === "POST" && url.pathname === "/v1/notifications/read")
      return reply(response, 200, await markNotificationRead(request, user));
    if (request.method === "POST" && url.pathname === "/v1/invoices/follow-up")
      return reply(response, 200, await markPaymentFollowUp(request, user));
    if (request.method === "POST" && url.pathname === "/v1/team/create")
      return reply(response, 200, await createStaff(request, user));
    if (request.method === "POST" && url.pathname === "/v1/team/assign")
      return reply(response, 200, await assignTeam(request, user));
    if (request.method === "POST" && url.pathname === "/v1/team/status")
      return reply(response, 200, await changeStaffStatus(request, user));
    if (request.method === "POST" && url.pathname === "/v1/payments/reverse")
      return reply(response, 200, await reversePayment(request, user));
    if (request.method === "POST" && url.pathname === "/v1/payments/record")
      return reply(response, 200, await recordInvoicePayment(request, user));
    if (request.method === "POST" && url.pathname === "/v1/payments/correct")
      return reply(response, 200, await correctPayment(request, user));
    if (request.method === "POST" && url.pathname === "/v1/purchases/payments")
      return reply(response, 200, await recordSupplierPayment(request, user));
    if (request.method === "POST" && url.pathname === "/v1/communications/configure")
      return reply(response, 200, await configure(request, user));
    if (request.method === "POST" && url.pathname === "/v1/communications/test-email")
      return reply(response, 200, await sendTestEmail(request, user));
    if (request.method === "POST" && url.pathname === "/v1/communications/send")
      return reply(response, 200, await send(request, user));
    throw new ApiError(404, "Route not found.");
  } catch (reason) {
    const status = reason instanceof ApiError ? reason.status : 500,
      errorReference = randomBytes(4).toString("hex").toUpperCase();
    if (status === 500)
      process.stderr.write(
        `[${errorReference}] ${request.method ?? "REQUEST"} ${request.url ?? "/"}: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}\n`,
      );
    reply(response, status, {
      error:
        status === 500
          ? `Server could not complete this request. Reference: ${errorReference}`
          : reason instanceof Error
            ? reason.message
            : "Request failed.",
    });
  }
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`DVCS API listening on 127.0.0.1:${port}\n`),
);
setTimeout(() => {
  void runInsuranceReminderWorker().catch((reason) =>
    process.stderr.write(
      `Insurance reminder worker: ${reason instanceof Error ? reason.message : "failed"}\n`,
    ),
  );
  void runServiceReminderWorker().catch((reason) =>
    process.stderr.write(
      `Service reminder worker: ${reason instanceof Error ? reason.message : "failed"}\n`,
    ),
  );
}, 30_000);
setInterval(
  () => {
    void runInsuranceReminderWorker().catch((reason) =>
      process.stderr.write(
        `Insurance reminder worker: ${reason instanceof Error ? reason.message : "failed"}\n`,
      ),
    );
    void runServiceReminderWorker().catch((reason) =>
      process.stderr.write(
        `Service reminder worker: ${reason instanceof Error ? reason.message : "failed"}\n`,
      ),
    );
  },
  6 * 60 * 60 * 1000,
);
