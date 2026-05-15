import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import AdminDataTable, { StatusPill } from '../AdminDataTable';
import { fullDate } from '../admin.utils';

const AdminUsersPanel = ({ users = [] }) => {
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

  const columns = [
    {
      key: 'user', label: 'User',
      render: (r) => (
        <div>
          <p className="font-bold text-black text-sm">{r.name || '—'}</p>
          <p className="text-[12px] text-secondary">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'role', label: 'Role',
      render: (r) => (
        <StatusPill label={r.role} className={r.role === 'ADMIN' ? 'bg-black text-white' : 'bg-black/[0.05] text-black/60'} />
      ),
    },
    {
      key: 'emailVerified', label: 'Verified',
      render: (r) => (
        <StatusPill
          label={r.emailVerified ? 'Verified' : 'Pending'}
          className={r.emailVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}
        />
      ),
    },
    { key: 'creditsBalance', label: 'Credits', render: (r) => <span className="font-bold tabular-nums">{r.creditsBalance ?? 0}</span> },
    { key: 'plan', label: 'Plan', render: (r) => <span className="text-secondary font-semibold">{r.plan || 'FREE'}</span> },
    { key: 'createdAt', label: 'Joined', render: (r) => <span className="text-[12px] text-secondary whitespace-nowrap">{fullDate(r.createdAt)}</span>, align: 'right' },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
        <input
          type="text"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-xl border border-black/[0.08] bg-[#FAFAF9] pl-8 pr-3 text-sm font-semibold text-black outline-none transition-colors focus:border-black/20 focus:bg-white"
        />
      </div>
      <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-3 text-sm font-semibold text-black outline-none focus:border-black/20">
        <option value="">All Roles</option>
        <option value="ADMIN">Admin</option>
        <option value="USER">User</option>
      </select>
      <select value={verifiedFilter} onChange={(e) => setVerifiedFilter(e.target.value)} className="h-9 rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-3 text-sm font-semibold text-black outline-none focus:border-black/20">
        <option value="">All Status</option>
        <option value="yes">Verified</option>
        <option value="no">Unverified</option>
      </select>
    </div>
  );

  return (
    <AdminDataTable
      title="Platform Users"
      description={`${filtered.length} user${filtered.length !== 1 ? 's' : ''}`}
      columns={columns}
      rows={filtered}
      toolbar={toolbar}
      emptyTitle="No users found"
      emptyDesc="Try adjusting your filters."
    />
  );
};

export default AdminUsersPanel;
