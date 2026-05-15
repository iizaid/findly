/** Shared admin formatting and styling utilities */

export const fmt = (v) => new Intl.NumberFormat().format(v || 0);

export const relTime = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
};

export const fullDate = (v) => {
  if (!v) return '-';
  return new Date(v).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

export const sourceLabel = (raw) => {
  const map = {
    LOCAL_DATASET: 'Indexed Source',
    DATASET_IMPORT: 'Admin Import',
    MANUAL_ADMIN: 'Manual Entry',
    GOOGLE_MAPS: 'Google Maps',
    INSTAGRAM: 'Instagram',
    FACEBOOK: 'Facebook',
    LINKEDIN: 'LinkedIn',
    TIKTOK: 'TikTok',
    YOUTUBE: 'YouTube',
    TRIPADVISOR: 'TripAdvisor',
    YELP: 'Yelp',
    WEBSITE: 'Website',
    SERPAPI: 'Online Source',
    REDDIT: 'Reddit',
    X: 'X',
    CSV: 'Admin Import',
    XLSX: 'Admin Import',
  };
  return map[raw] || (raw || '-').replace(/_/g, ' ');
};

export const actionLabel = (raw) => {
  const map = {
    FAILED_LOGIN: 'Failed Login',
    ADMIN_ACCESS_DENIED: 'Admin Access Denied',
    DASHBOARD_ACCESS_DENIED_UNVERIFIED: 'Unverified Dashboard Access',
    SESSION_REVOKED: 'Session Revoked',
    USER_LOGGED_OUT: 'User Logged Out',
    EMAIL_VERIFICATION_FAILED: 'Email Verification Failed',
    EMAIL_VERIFICATION_RESENT: 'Verification Email Resent',
    EMAIL_VERIFIED: 'Email Verified',
    DATASET_IMPORTED: 'Dataset Imported',
    SEARCH_CAMPAIGN_LOCAL_DATASET_RUN: 'Indexed Search Run',
    SEARCH_CAMPAIGN_LOCAL_DATASET_FALLBACK: 'Search Fallback Used',
    ADMIN_BULK_IMPORT_COMMITTED: 'Bulk Import Committed',
    ADMIN_CATALOG_LEAD_CREATED: 'Manual Lead Added',
  };
  return map[raw] || (raw || '').replace(/_/g, ' ');
};

export const campaignStatusStyle = (s) => {
  const styles = {
    COMPLETED: 'bg-emerald-50 text-emerald-700',
    RUNNING: 'bg-blue-50 text-blue-700',
    PENDING: 'bg-amber-50 text-amber-700',
    FAILED: 'bg-red-50 text-red-700',
    CANCELLED: 'bg-neutral-100 text-neutral-500',
  };
  return styles[s] || 'bg-neutral-100 text-neutral-600';
};

export const severityStyle = (s) => {
  const styles = {
    critical: 'bg-red-50 text-red-700 border-red-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
  };
  return styles[s] || 'bg-neutral-50 text-neutral-600 border-neutral-200';
};

export const systemStatusStyle = (s) => {
  const map = {
    online: { dot: 'bg-emerald-500', label: 'Online', bg: 'bg-emerald-50 text-emerald-700' },
    available: { dot: 'bg-emerald-500', label: 'Ready', bg: 'bg-emerald-50 text-emerald-700' },
    degraded: { dot: 'bg-amber-500', label: 'Degraded', bg: 'bg-amber-50 text-amber-700' },
    empty: { dot: 'bg-neutral-400', label: 'Empty', bg: 'bg-neutral-50 text-neutral-500' },
    not_configured: { dot: 'bg-neutral-300', label: 'Not Configured', bg: 'bg-neutral-50 text-neutral-500' },
    coming_later: { dot: 'bg-neutral-300', label: 'Coming Later', bg: 'bg-neutral-50 text-neutral-400' },
    not_implemented: { dot: 'bg-neutral-300', label: 'Planned', bg: 'bg-neutral-50 text-neutral-400' },
  };
  return map[s] || { dot: 'bg-neutral-300', label: s || 'Unknown', bg: 'bg-neutral-50 text-neutral-500' };
};

export const importStatusStyle = (s) => {
  const map = {
    COMPLETED: 'bg-emerald-50 text-emerald-700',
    PROCESSING: 'bg-blue-50 text-blue-700',
    PENDING: 'bg-amber-50 text-amber-700',
    FAILED: 'bg-red-50 text-red-700',
  };
  return map[s] || 'bg-neutral-100 text-neutral-600';
};

export const httpStatusStyle = (code) => {
  if (!code) return 'bg-neutral-100 text-neutral-600';
  if (code >= 500) return 'bg-red-50 text-red-700';
  if (code >= 400) return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
};

export const copyToClipboard = (text) => {
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
};
