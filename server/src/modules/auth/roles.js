/**
 * Central role hierarchy and permission helpers.
 *
 * Rank: ROOT (40) > ADMIN (30) > MODERATOR (20) > USER (10)
 *
 * Rules enforced here:
 * - ROOT can only be assigned via bootstrap script, never from dashboard.
 * - The last ROOT can never be demoted.
 * - ADMIN/MODERATOR/USER cannot manage roles.
 */

export const ROLE_RANK = {
  USER: 10,
  MODERATOR: 20,
  ADMIN: 30,
  ROOT: 40,
};

/** All valid roles in ascending rank order. */
export const ALL_ROLES = ['USER', 'MODERATOR', 'ADMIN', 'ROOT'];

/** Roles that can be assigned via the dashboard role-management endpoint. */
export const DASHBOARD_ASSIGNABLE_ROLES = ['USER', 'MODERATOR', 'ADMIN'];

/**
 * Human-readable label for a role.
 */
export const formatRole = (role) => {
  const labels = { ROOT: 'Root', ADMIN: 'Admin', MODERATOR: 'Moderator', USER: 'User' };
  return labels[role] || role;
};

/**
 * Normalise user input to a valid role string or null.
 */
export const normalizeRole = (value) => {
  if (!value || typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return ALL_ROLES.includes(upper) ? upper : null;
};

/**
 * True when the user's role is at least the required level.
 */
export const hasRoleAtLeast = (userRole, requiredRole) => {
  const userRank = ROLE_RANK[userRole];
  const requiredRank = ROLE_RANK[requiredRole];
  if (userRank == null || requiredRank == null) return false;
  return userRank >= requiredRank;
};

/** Can access general admin routes (ROOT or ADMIN). */
export const canAccessAdmin = (userRole) => hasRoleAtLeast(userRole, 'ADMIN');

/** Can access moderator-level admin views (ROOT, ADMIN, or MODERATOR). */
export const canAccessModeratorAdmin = (userRole) => hasRoleAtLeast(userRole, 'MODERATOR');

/** True if the role is ROOT. */
export const isRootRole = (role) => role === 'ROOT';

/**
 * Determines whether an actor may change a target's role.
 *
 * @param {object} params
 * @param {string} params.actorRole   - Role of the person making the change.
 * @param {string} params.targetRole  - Current role of the target user.
 * @param {string} params.nextRole    - Desired new role for the target.
 * @param {boolean} params.isLastRoot - Whether the target is the last ROOT.
 * @param {boolean} params.sameUser   - Whether actor === target.
 * @returns {{ allowed: boolean, reason?: string }}
 */
export const canManageRole = ({ actorRole, targetRole, nextRole, isLastRoot = false, sameUser = false }) => {
  // Only ROOT can manage roles.
  if (actorRole !== 'ROOT') {
    return { allowed: false, reason: 'Only the root owner can change user roles.' };
  }

  // ROOT cannot be assigned through the dashboard endpoint.
  if (nextRole === 'ROOT') {
    return { allowed: false, reason: 'ROOT cannot be assigned through the dashboard. Use the bootstrap script.' };
  }

  // The next role must be a valid dashboard-assignable role.
  if (!DASHBOARD_ASSIGNABLE_ROLES.includes(nextRole)) {
    return { allowed: false, reason: `Invalid target role: ${nextRole}.` };
  }

  // Cannot demote yourself if you are the last ROOT.
  if (sameUser && isLastRoot) {
    return { allowed: false, reason: 'Cannot demote yourself — you are the only root owner.' };
  }

  // Cannot modify another ROOT from the dashboard.
  if (targetRole === 'ROOT') {
    return { allowed: false, reason: 'ROOT users cannot be modified from the dashboard.' };
  }

  // No-op change.
  if (targetRole === nextRole) {
    return { allowed: false, reason: 'The user already has that role.' };
  }

  return { allowed: true };
};
