import type { Membership, UserProfile } from "@dvcs/types";
export interface AuthSession {
  user: UserProfile;
  memberships: Membership[];
  activeCompanyId?: string;
  activeBranchId?: string;
}
export function isAuthenticated(session: AuthSession | null): session is AuthSession {
  return session !== null && session.user.status === "active";
}
