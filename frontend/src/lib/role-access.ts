import type { DemoUser } from "./auth";

const adminAuthorityRoles = new Set(["ADMIN", "RECALL_AUTHORITY"]);
const transferInitiators = new Set(["MANUFACTURER", "IMPORTER", "DISTRIBUTOR", "ADMIN", "RECALL_AUTHORITY"]);
const transferReceivers = new Set(["IMPORTER", "DISTRIBUTOR", "CLINIC", "PHARMACY", "ADMIN", "RECALL_AUTHORITY"]);
const productRegistrars = new Set(["MANUFACTURER", "IMPORTER", "ADMIN"]);
const endUserRoles = new Set(["CLINIC", "PHARMACY"]);

function userRoles(user: DemoUser | null | undefined) {
  return new Set([user?.role, ...(user?.roles || [])].filter(Boolean) as string[]);
}

export function hasAnyRole(user: DemoUser | null | undefined, roles: Iterable<string>) {
  const assignedRoles = userRoles(user);
  return Array.from(roles).some((role) => assignedRoles.has(role));
}

export function isAdminAuthority(user: DemoUser | null | undefined) {
  return hasAnyRole(user, adminAuthorityRoles);
}

export function isPublicUser(user: DemoUser | null | undefined) {
  if (!user) return true;
  const assignedRoles = userRoles(user);
  return assignedRoles.size === 0 || (assignedRoles.size === 1 && assignedRoles.has("PUBLIC"));
}

export function isEndUserRole(user: DemoUser | null | undefined) {
  return Boolean(user?.role && endUserRoles.has(user.role));
}

export function canInitiateTransfer(user: DemoUser | null | undefined) {
  return hasAnyRole(user, transferInitiators);
}

export function canReceiveTransfer(user: DemoUser | null | undefined) {
  return hasAnyRole(user, transferReceivers);
}

export function canViewTransfers(user: DemoUser | null | undefined) {
  return (
    canInitiateTransfer(user) ||
    canReceiveTransfer(user) ||
    hasAnyRole(user, ["AUDITOR", "RECALL_AUTHORITY"])
  );
}

export function canRegisterProducts(user: DemoUser | null | undefined) {
  return hasAnyRole(user, productRegistrars);
}

export function canApproveImports(user: DemoUser | null | undefined) {
  return isAdminAuthority(user);
}

export function canManageRecall(user: DemoUser | null | undefined) {
  return isAdminAuthority(user);
}

export function canManageRoles(user: DemoUser | null | undefined) {
  return isAdminAuthority(user);
}

export function canManageArchivedData(user: DemoUser | null | undefined) {
  return isAdminAuthority(user);
}

export function canViewAllScope(user: DemoUser | null | undefined) {
  return hasAnyRole(user, ["ADMIN", "AUDITOR", "RECALL_AUTHORITY"]);
}

export function canEditProductMetadata(user: DemoUser | null | undefined) {
  return canRegisterProducts(user);
}

export function canViewInternalProducts(user: DemoUser | null | undefined) {
  return !isPublicUser(user);
}

export function canViewOperationalRisk(user: DemoUser | null | undefined) {
  return !isPublicUser(user);
}

export function canAccessDashboardPath(user: DemoUser | null | undefined, pathname: string) {
  if (!user) return false;
  if (pathname === "/dashboard") return true;
  if (pathname === "/dashboard/scan" || pathname.startsWith("/dashboard/verify/")) return true;
  if (pathname === "/dashboard/role-request") return isPublicUser(user);

  if (pathname.startsWith("/dashboard/admin/roles")) return canManageRoles(user);
  if (pathname.startsWith("/dashboard/admin/archived")) return canManageArchivedData(user);
  if (pathname.startsWith("/dashboard/recall")) return canManageRecall(user);
  if (pathname.startsWith("/dashboard/products/import-approvals")) return canApproveImports(user);
  if (
    pathname.startsWith("/dashboard/products/register") ||
    pathname.startsWith("/dashboard/products/bulk")
  ) {
    return canRegisterProducts(user);
  }
  if (pathname.startsWith("/dashboard/products")) return canViewInternalProducts(user);

  if (pathname.startsWith("/dashboard/transfers/create")) return canInitiateTransfer(user);
  if (
    pathname.startsWith("/dashboard/transfers") ||
    pathname.startsWith("/dashboard/scan-transfer")
  ) {
    return canViewTransfers(user);
  }

  if (
    pathname.startsWith("/dashboard/risk") ||
    pathname.startsWith("/dashboard/disputes")
  ) {
    return canViewOperationalRisk(user);
  }

  return false;
}
