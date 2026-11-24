/**
 * Staff module — public API.
 * Staff identity, roles and credential verification for the garage dashboard.
 */
export {
  ADMIN_ROLES,
  ROLE_LABELS,
  STAFF_ROLES,
  hasRole,
  isStaffRole,
  type StaffRole,
} from "./roles";
export { staffPasswordSchema, staffSignInSchema, type StaffSignInInput } from "./schemas";
