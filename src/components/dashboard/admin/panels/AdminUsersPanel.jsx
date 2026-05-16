import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Users, ShieldCheck, UserX, CreditCard, Crown, AlertCircle, CheckCircle2, X, RefreshCw } from 'lucide-react';
import { fullDate, fmt } from '../admin.utils';
import { apiRequest } from '../../../../lib/api';

const PAGE_LIMIT = 20;

/* ---- Role badge styling ---- */
const roleBadge = (role) => {
  const styles = {
    ROOT: 'bg-purple-100 text-purple-800',
    ADMIN: 'bg-black text-white',
    MODERATOR: 'bg-blue-100 text-blue-800',
    USER: 'bg-black/[0.04] text-black/60',
  };
  const labels = { ROOT: 'Root', ADMIN: 'Admin', MODERATOR: 'Moderator', USER: 'User' };
  return { className: styles[role] || styles.USER, label: labels[role] || role };
};

const getErrorMessage = (err, fallback) => err?.message || fallback;

/* ---- Role Change Modal ---- */
const RoleChangeModal = ({ target, onClose, onSuccess }) => {
  const [nextRole, setNextRole] = useState('');
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const badge = roleBadge(target.role);
  const nextBadge = nextRole ? roleBadge(nextRole) : null;

  const canSubmit = nextRole
    && nextRole !== target.role
    && reason.length >= 8
    && confirmEmail === target.email
    && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${target.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole, reason, confirmEmail }),
      });
      setSuccess(`Role changed to ${roleBadge(nextRole).label}.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      setError(getErrorMessage(err, 'Role change failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-[480px] rounded-[24px] bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-black">Change User Role</h3>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-black/60 hover:bg-black/10">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-4 mb-5">
          <p className="text-[13px] font-bold text-black">{target.name || 'No Name'}</p>
          <p className="text-[12px] font-medium text-secondary mt-0.5">{target.email}</p>
          <div className="mt-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}>
              Current: {badge.label}
            </span>
          </div>
        </div>

        {success ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700">
            <CheckCircle2 size={18} />
            <p className="text-sm font-bold">{success}</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 mb-4">
                <AlertCircle size={18} className="shrink-0" />
                <p className="text-sm font-bold">{error}</p>
              </div>
            )}

            <label className="block mb-4">
              <span className="text-[13px] font-semibold text-black mb-1.5 block">New Role</span>
              <select
                value={nextRole}
                onChange={(e) => setNextRole(e.target.value)}
                className="h-11 w-full rounded-[14px] border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              >
                <option value="">Select role...</option>
                {['USER', 'MODERATOR', 'ADMIN'].filter((r) => r !== target.role).map((r) => (
                  <option key={r} value={r}>{roleBadge(r).label}</option>
                ))}
              </select>
              {nextBadge && (
                <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${nextBadge.className}`}>
                  -&gt; {nextBadge.label}
                </span>
              )}
            </label>

            <label className="block mb-4">
              <span className="text-[13px] font-semibold text-black mb-1.5 block">Reason <span className="text-secondary">(min 8 chars)</span></span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why is this role being changed?"
                className="w-full rounded-[14px] border border-black/[0.08] bg-white px-4 py-3 text-[13px] font-semibold text-black outline-none resize-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
            </label>

            <label className="block mb-6">
              <span className="text-[13px] font-semibold text-black mb-1.5 block">Confirm email</span>
              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={`Type ${target.email} to confirm`}
                className="h-11 w-full rounded-[14px] border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
              {confirmEmail && confirmEmail !== target.email && (
                <p className="mt-1 text-[11px] font-bold text-red-600">Email does not match.</p>
              )}
            </label>

            {nextRole && nextRole !== target.role && (
              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3 mb-5">
                <p className="text-[12px] font-bold text-yellow-900">
                  You are changing <strong>{target.name || target.email}</strong> from <strong>{roleBadge(target.role).label}</strong> to <strong>{roleBadge(nextRole).label}</strong>.
                </p>
                <p className="text-[11px] font-medium text-yellow-800/80 mt-1">This action affects dashboard access permissions.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-black/[0.08] bg-white text-[13px] font-bold text-black hover:bg-black/5 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 h-11 rounded-xl bg-black text-[13px] font-bold text-white hover:bg-black/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving...' : 'Confirm Change'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ---- ROOT Credit Grant Modal ---- */
const GrantCreditsModal = ({ target, onClose, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const numericAmount = Number(amount);
  const canSubmit = Number.isInteger(numericAmount)
    && numericAmount >= 1
    && numericAmount <= 1000000
    && reason.trim().length >= 8
    && confirmEmail === target.email
    && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${target.id}/credits/grant`, {
        method: 'POST',
        body: JSON.stringify({ amount: numericAmount, reason: reason.trim(), confirmEmail }),
      });
      setSuccess(`${fmt(numericAmount)} credits granted.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      setError(getErrorMessage(err, 'Credit grant failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-[500px] rounded-[24px] bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-black">Grant Credits</h3>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-black/60 hover:bg-black/10">
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-4 mb-5">
          <p className="text-[13px] font-bold text-black">{target.name || 'No Name'}</p>
          <p className="text-[12px] font-medium text-secondary mt-0.5">{target.email}</p>
          <p className="mt-2 text-[12px] font-bold text-black">Current credits: {fmt(target.creditsBalance || 0)}</p>
        </div>

        {success ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700">
            <CheckCircle2 size={18} />
            <p className="text-sm font-bold">{success}</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 mb-4">
                <AlertCircle size={18} className="shrink-0" />
                <p className="text-sm font-bold">{error}</p>
              </div>
            )}

            <label className="block mb-4">
              <span className="text-[13px] font-semibold text-black mb-1.5 block">Amount</span>
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Credits to add"
                className="h-11 w-full rounded-[14px] border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
            </label>

            <label className="block mb-4">
              <span className="text-[13px] font-semibold text-black mb-1.5 block">Reason <span className="text-secondary">(min 8 chars)</span></span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why are credits being granted?"
                className="w-full rounded-[14px] border border-black/[0.08] bg-white px-4 py-3 text-[13px] font-semibold text-black outline-none resize-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
            </label>

            <label className="block mb-5">
              <span className="text-[13px] font-semibold text-black mb-1.5 block">Confirm email</span>
              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={`Type ${target.email} to confirm`}
                className="h-11 w-full rounded-[14px] border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
              {confirmEmail && confirmEmail !== target.email && (
                <p className="mt-1 text-[11px] font-bold text-red-600">Email does not match.</p>
              )}
            </label>

            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3 mb-5">
              <p className="text-[12px] font-bold text-yellow-900">
                This will add credits to the user balance and create a ledger entry.
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-black/[0.08] bg-white text-[13px] font-bold text-black hover:bg-black/5 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 h-11 rounded-xl bg-black text-[13px] font-bold text-white hover:bg-black/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Granting...' : 'Grant Credits'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ============================================================== */
/*  USERS MANAGEMENT PANEL                                         */
/* ============================================================== */
const AdminUsersPanel = ({ currentUser, onSelect }) => {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roleTarget, setRoleTarget] = useState(null);
  const [creditsTarget, setCreditsTarget] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestIdRef = useRef(0);

  const isRoot = currentUser?.role === 'ROOT';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, verifiedFilter]);

  useEffect(() => {
    let active = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_LIMIT),
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (roleFilter) params.set('role', roleFilter);
    if (verifiedFilter === 'yes') params.set('emailVerified', 'true');
    if (verifiedFilter === 'no') params.set('emailVerified', 'false');

    setLoading(true);
    setError(null);
    apiRequest(`/api/admin/users?${params.toString()}`)
      .then((response) => {
        if (!active || requestIdRef.current !== requestId) return;
        setUsers(response.data.users || []);
        setPagination(response.data.pagination || { page, limit: PAGE_LIMIT, total: 0 });
      })
      .catch((err) => {
        if (!active || requestIdRef.current !== requestId) return;
        setError(getErrorMessage(err, 'Could not load users.'));
      })
      .finally(() => {
        if (active && requestIdRef.current === requestId) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, debouncedSearch, roleFilter, verifiedFilter, refreshToken]);

  const pageCount = Math.max(1, Math.ceil((pagination.total || 0) / PAGE_LIMIT));
  const verified = users.filter((u) => u.emailVerified).length;
  const admins = users.filter((u) => u.role === 'ADMIN' || u.role === 'ROOT').length;
  const unverified = users.length - verified;
  const totalCredits = users.reduce((acc, u) => acc + (u.creditsBalance || 0), 0);

  const refreshUsers = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  const handleRoleChangeSuccess = useCallback(() => {
    refreshUsers();
  }, [refreshUsers]);

  const handleCreditGrantSuccess = useCallback(() => {
    refreshUsers();
  }, [refreshUsers]);

  return (
    <div className="space-y-6">
      {roleTarget && (
        <RoleChangeModal
          target={roleTarget}
          onClose={() => setRoleTarget(null)}
          onSuccess={handleRoleChangeSuccess}
        />
      )}

      {creditsTarget && (
        <GrantCreditsModal
          target={creditsTarget}
          onClose={() => setCreditsTarget(null)}
          onSuccess={handleCreditGrantSuccess}
        />
      )}

      {!isRoot && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-800">
          <p className="text-[13px] font-bold">Only the root owner can change access roles or grant credits.</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
          <p className="text-[13px] font-bold">{error}</p>
        </div>
      )}

      {/* SUMMARY METRICS */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Matching Users</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black leading-none">{fmt(pagination.total || 0)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={14} className="text-emerald-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Page Verified</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-emerald-600 leading-none">{fmt(verified)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Crown size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Page Admin+</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black leading-none">{fmt(admins)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <UserX size={14} className="text-amber-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Page Pending</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-amber-600 leading-none">{fmt(unverified)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Page Credits</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black/60 leading-none">{fmt(totalCredits)}</p>
        </div>
      </section>

      {/* USER LIST */}
      <section className="rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-[14px] border border-black/[0.06] bg-white pl-10 pr-4 text-[13px] font-semibold text-black placeholder:text-black/30 outline-none transition-colors focus:border-black/20 focus:ring-4 focus:ring-black/5"
                aria-label="Search users"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
              className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
            >
              <option value="">All Roles</option>
              <option value="ROOT">Root</option>
              <option value="ADMIN">Admin</option>
              <option value="MODERATOR">Moderator</option>
              <option value="USER">User</option>
            </select>
            <select
              value={verifiedFilter}
              onChange={(e) => setVerifiedFilter(e.target.value)}
              aria-label="Filter by verification"
              className="h-11 rounded-[14px] border border-black/[0.06] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
            >
              <option value="">All Status</option>
              <option value="yes">Verified</option>
              <option value="no">Unverified</option>
            </select>
            <button
              type="button"
              onClick={refreshUsers}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-black/[0.06] bg-white px-4 text-[13px] font-bold text-black transition-colors hover:bg-black/[0.03] disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw size={24} className="animate-spin text-black/30" />
              <p className="mt-3 text-[13px] font-bold text-secondary">Loading users...</p>
            </div>
          ) : users.length > 0 ? (
            <div className={`divide-y divide-black/[0.03] ${loading ? 'opacity-60' : ''}`}>
              {users.map((u) => {
                const badge = roleBadge(u.role);
                const canChangeRole = isRoot && u.role !== 'ROOT';
                const canGrantCredits = isRoot;
                return (
                  <div
                    key={u.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-[#FAFAF9] transition-colors cursor-pointer group gap-4"
                  >
                    <div className="flex items-center gap-4 sm:w-2/5" onClick={() => onSelect?.(u)}>
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[16px] font-bold ${u.role === 'ROOT' ? 'bg-purple-100 text-purple-800' : u.role === 'ADMIN' ? 'bg-black text-white' : 'bg-black/[0.04] text-black/60'}`}>
                        {(u.name || u.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[15px] font-bold text-black group-hover:text-accent transition-colors truncate">
                          {u.name || 'No Name'}
                        </h4>
                        <p className="text-[13px] font-medium text-secondary truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:w-1/4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${u.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {u.emailVerified ? 'Verified' : 'Pending'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 sm:w-1/3 justify-end">
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Credits</p>
                        <p className="text-[16px] font-extrabold tabular-nums text-black">{fmt(u.creditsBalance || 0)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Joined</p>
                        <p className="text-[12px] font-semibold text-secondary whitespace-nowrap">{fullDate(u.createdAt)}</p>
                      </div>
                      <div className="flex gap-2">
                        {canGrantCredits && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCreditsTarget(u); }}
                            className="shrink-0 h-8 rounded-lg border border-black/10 bg-white px-3 text-[11px] font-bold text-black hover:bg-black/5 transition-colors"
                          >
                            Credits
                          </button>
                        )}
                        {canChangeRole && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setRoleTarget(u); }}
                            className="shrink-0 h-8 rounded-lg border border-black/10 bg-white px-3 text-[11px] font-bold text-black hover:bg-black/5 transition-colors"
                          >
                            Role
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black/[0.02] text-black/20 mb-4">
                <Users size={28} />
              </div>
              <h4 className="text-[15px] font-bold text-black">No users found</h4>
              <p className="text-[13px] font-medium text-secondary mt-1">Try adjusting your filters.</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-black/[0.03] bg-[#FAFAF9] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] font-bold text-secondary">
            Page {pagination.page || page} of {pageCount} · {fmt(pagination.total || 0)} matching users
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={loading || page <= 1}
              className="h-9 rounded-lg border border-black/[0.08] bg-white px-4 text-[12px] font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={loading || page >= pageCount}
              className="h-9 rounded-lg border border-black/[0.08] bg-white px-4 text-[12px] font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminUsersPanel;
