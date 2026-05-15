import { useState, useMemo } from 'react';
import { Search, Users, ShieldCheck, UserX, CreditCard, Crown } from 'lucide-react';
import { fullDate, fmt } from '../admin.utils';

/* ============================================================== */
/*  USERS MANAGEMENT PANEL                                         */
/* ============================================================== */
const AdminUsersPanel = ({ users = [], onSelect }) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');

  const filtered = useMemo(() => {
    let list = users;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q));
    }
    if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    if (verifiedFilter === 'yes') list = list.filter((u) => u.emailVerified);
    if (verifiedFilter === 'no') list = list.filter((u) => !u.emailVerified);
    return list;
  }, [users, search, roleFilter, verifiedFilter]);

  const total = users.length;
  const verified = users.filter(u => u.emailVerified).length;
  const admins = users.filter(u => u.role === 'ADMIN').length;
  const unverified = total - verified;
  const totalCredits = users.reduce((acc, u) => acc + (u.creditsBalance || 0), 0);

  return (
    <div className="space-y-6">
      {/* SUMMARY METRICS */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Users size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Users</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black leading-none">{fmt(total)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={14} className="text-emerald-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Verified</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-emerald-600 leading-none">{fmt(verified)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Crown size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Admins</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black leading-none">{fmt(admins)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <UserX size={14} className="text-amber-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Unverified</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-amber-600 leading-none">{fmt(unverified)}</p>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={14} className="text-black/40" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Credits</p>
          </div>
          <p className="text-[28px] font-extrabold tracking-tight text-black/60 leading-none">{fmt(totalCredits)}</p>
        </div>
      </section>

      {/* USER LIST */}
      <section className="rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" />
              <input
                type="text"
                placeholder="Search by name or email…"
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
              <option value="ADMIN">Admin</option>
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
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length > 0 ? (
            <div className="divide-y divide-black/[0.03]">
              {filtered.map((user) => (
                <div
                  key={user.id}
                  onClick={() => onSelect?.(user)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-[#FAFAF9] transition-colors cursor-pointer group gap-4"
                >
                  {/* Left: Identity */}
                  <div className="flex items-center gap-4 sm:w-2/5">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[16px] font-bold ${user.role === 'ADMIN' ? 'bg-black text-white' : 'bg-black/[0.04] text-black/60'}`}>
                      {(user.name || user.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[15px] font-bold text-black group-hover:text-accent transition-colors truncate">
                        {user.name || 'No Name'}
                      </h4>
                      <p className="text-[13px] font-medium text-secondary truncate">{user.email}</p>
                    </div>
                  </div>

                  {/* Middle: Status */}
                  <div className="flex items-center gap-2 sm:w-1/4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${user.role === 'ADMIN' ? 'bg-black text-white' : 'bg-black/[0.04] text-black/60'}`}>
                      {user.role || 'USER'}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${user.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {user.emailVerified ? 'Verified' : 'Pending'}
                    </span>
                  </div>

                  {/* Right: Credits & Date */}
                  <div className="flex items-center gap-6 sm:w-1/4 justify-end">
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Credits</p>
                      <p className="text-[16px] font-extrabold tabular-nums text-black">{fmt(user.creditsBalance || 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Joined</p>
                      <p className="text-[12px] font-semibold text-secondary whitespace-nowrap">{fullDate(user.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
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
      </section>
    </div>
  );
};

export default AdminUsersPanel;
