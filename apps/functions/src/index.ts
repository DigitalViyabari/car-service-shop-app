import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { callableRequestSchema } from "@dvcs/validation";

initializeApp();

export const branchAccessHealth = onCall(
  { enforceAppCheck: true, region: "asia-south1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    const parsed = callableRequestSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Invalid branch context.");
    const { companyId, branchId } = parsed.data;
    const membershipId = `${request.auth.uid}_${companyId}`;
    const [membership, subscription] = await Promise.all([
      getFirestore().doc(`memberships/${membershipId}`).get(),
      getFirestore().doc(`branchSubscriptions/${branchId}`).get(),
    ]);
    if (!membership.exists || membership.get("status") !== "active")
      throw new HttpsError("permission-denied", "No active company membership.");
    const companyRoles = membership.get("companyRoles") as unknown[] | undefined;
    const branchAssignments = membership.get("branchAssignments") as
      { branchId?: string }[] | undefined;
    if (!companyRoles?.length && !branchAssignments?.some((item) => item.branchId === branchId))
      throw new HttpsError("permission-denied", "Branch assignment is required.");
    if (!subscription.exists || subscription.get("companyId") !== companyId)
      throw new HttpsError("failed-precondition", "Branch subscription is unavailable.");
    return {
      branchId,
      subscriptionStatus: subscription.get("status") as string,
      checkedAt: new Date().toISOString(),
    };
  },
);
