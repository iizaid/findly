import { useEffect, useState } from 'react';
import { AlertCircle, Database, FileSpreadsheet, Loader2, Search, ShieldCheck, Users, PlusCircle, CheckCircle2 } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';
import { apiRequest, ApiError } from '../../../lib/api';
import BulkImportCenter from './BulkImportCenter';

const fmt = (value) => new Intl.NumberFormat().format(value || 0);
const date = (value) => (value ? new Date(value).toLocaleString() : '-');

const Stat = ({ label, value, icon: Icon }) => (
  <div className="rounded-[22px] border border-black/[0.08] bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.04)]">
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-black">
      <Icon size={20} />
    </div>
    <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-secondary">{label}</p>
    <p className="mt-2 text-3xl font-bold tracking-tight">{fmt(value)}</p>
  </div>
);

const MiniTable = ({ title, rows, columns, empty, loading }) => (
  <DashboardCard className="p-5 h-full">
    {title && <h3 className="text-xl font-bold tracking-tight mb-4">{title}</h3>}
    {loading ? (
      <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin text-secondary" /></div>
    ) : rows?.length ? (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-secondary border-b border-black/[0.08]">
            <tr>{columns.map((column) => <th key={column.key} className="py-2 pr-4">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id || JSON.stringify(row)} className="border-b border-black/[0.05] last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="py-3 pr-4 font-semibold text-black/78">{column.render ? column.render(row) : row[column.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <DashboardEmptyState title={empty || 'No records found'} description="Try adjusting your filters or wait for more data." />
    )}
  </DashboardCard>
);

const Tabs = ({ tabs, activeTab, onChange }) => (
  <div className="flex flex-wrap gap-2 mb-6 border-b border-black/10 pb-4">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
          activeTab === tab.id ? 'bg-black text-white' : 'bg-black/5 text-black/60 hover:bg-black/10 hover:text-black'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const ManualEntryForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    businessName: '', category: '', country: 'Jordan', governorate: '',
    address: '', websiteUrl: '', instagramUrl: '', facebookUrl: '', googleMapsUrl: '',
    phone: '', whatsappNumber: '', email: '', notes: ''
  });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setError('');

    try {
      await apiRequest('/api/admin/catalog/leads', {
        method: 'POST',
        body: JSON.stringify({ ...formData, sourceType: 'MANUAL_ADMIN' })
      });
      setStatus('success');
      setFormData({
        businessName: '', category: '', country: 'Jordan', governorate: '',
        address: '', websiteUrl: '', instagramUrl: '', facebookUrl: '', googleMapsUrl: '',
        phone: '', whatsappNumber: '', email: '', notes: ''
      });
      if (onSuccess) onSuccess();
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add lead');
      setStatus('idle');
    }
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  return (
    <DashboardCard className="p-6 max-w-3xl">
      <h3 className="text-xl font-bold tracking-tight mb-6 flex items-center gap-2">
        <PlusCircle size={20} className="text-accent" />
        Add Lead to Catalog
      </h3>
      {error && (
        <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {status === 'success' && (
        <div className="mb-6 rounded-xl bg-[#E6F4EA] p-4 text-sm font-bold text-[#137333] flex items-center gap-2">
          <CheckCircle2 size={16} /> Lead added to global catalog successfully!
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Business Name *</label>
            <input required name="businessName" value={formData.businessName} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Category</label>
            <input name="category" value={formData.category} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Country *</label>
            <input required name="country" value={formData.country} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Governorate/City</label>
            <input name="governorate" value={formData.governorate} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Address</label>
            <input name="address" value={formData.address} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Website URL</label>
            <input type="url" name="websiteUrl" value={formData.websiteUrl} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Instagram URL</label>
            <input type="url" name="instagramUrl" value={formData.instagramUrl} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Phone</label>
            <input name="phone" value={formData.phone} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">WhatsApp</label>
            <input name="whatsappNumber" value={formData.whatsappNumber} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Google Maps URL</label>
            <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Notes / Internal Raw Data</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full rounded-xl border border-black/10 px-4 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
        </div>
        <div className="pt-4">
          <button type="submit" disabled={status === 'submitting'} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 md:w-auto">
            {status === 'submitting' ? <Loader2 className="animate-spin" size={16} /> : 'Save Lead'}
          </button>
        </div>
      </form>
    </DashboardCard>
  );
};

const CatalogTab = () => {
  const [data, setData] = useState({ leads: [], loading: true });
  const [search, setSearch] = useState('');
  
  const loadLeads = async (q = '') => {
    setData(d => ({ ...d, loading: true }));
    try {
      const res = await apiRequest(`/api/admin/catalog/leads?limit=20${q ? `&search=${encodeURIComponent(q)}` : ''}`);
      setData({ leads: res.data.leads || [], loading: false });
    } catch {
      setData({ leads: [], loading: false });
    }
  };

  useEffect(() => { loadLeads(search); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadLeads(search);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input 
          type="text" 
          placeholder="Search catalog by name..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-black/10 px-4 py-3 text-sm focus:border-black focus:outline-none"
        />
        <button type="submit" className="rounded-xl bg-black px-6 font-bold text-white hover:bg-black/80">Search</button>
      </form>
      <MiniTable 
        loading={data.loading}
        rows={data.leads}
        columns={[
          { key: 'businessName', label: 'Business' },
          { key: 'category', label: 'Category', render: r => r.category || '-' },
          { key: 'city', label: 'City', render: r => r.city || '-' },
          { key: 'source', label: 'Source' },
          { key: 'contact', label: 'Contact', render: r => [r.websiteUrl && 'Web', r.instagramUrl && 'IG', r.phone && 'Phone'].filter(Boolean).join(', ') || '-' },
          { key: 'importedAt', label: 'Imported', render: r => date(r.importedAt) }
        ]}
      />
    </div>
  );
};

const DashboardAdminPage = ({ user, onNavigate }) => {
  const [state, setState] = useState({ status: 'loading' });
  const [activeTab, setActiveTab] = useState('overview');

  const loadData = async () => {
    try {
      const [summary, users, catalog, imports, campaigns, security, errors] = await Promise.all([
        apiRequest('/api/admin/summary'),
        apiRequest('/api/admin/users?limit=20'),
        apiRequest('/api/admin/catalog/stats'),
        apiRequest('/api/admin/imports?limit=20'),
        apiRequest('/api/admin/campaigns?limit=20'),
        apiRequest('/api/admin/security/events?limit=20'),
        apiRequest('/api/admin/errors?limit=20'),
      ]);
      setState({
        status: 'ready',
        data: {
          summary: summary.data,
          users: users.data.users || [],
          catalog: catalog.data,
          imports: imports.data.imports || [],
          campaigns: campaigns.data.campaigns || [],
          security: security.data.events || [],
          errors: errors.data.errors || [],
        },
      });
    } catch (error) {
      setState({
        status: error instanceof ApiError && error.status === 403 ? 'denied' : 'error',
        message: error instanceof ApiError ? error.message : 'Could not load admin operations.',
      });
    }
  };

  useEffect(() => {
    let active = true;
    if (active) loadData();
    return () => { active = false; };
  }, []);

  if (user?.role !== 'ADMIN' || state.status === 'denied') {
    return (
      <DashboardCard className="p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white">
          <ShieldCheck size={24} />
        </div>
        <h2 className="mt-6 text-4xl font-bold tracking-tight">Admin access required.</h2>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-secondary">
          This operations center is only available to verified Findly administrators.
        </p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="mt-6 rounded-full bg-black px-5 py-3 text-sm font-bold text-white">
          Back to dashboard
        </button>
      </DashboardCard>
    );
  }

  if (state.status === 'loading') {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-secondary" size={32} /></div>;
  }

  if (state.status === 'error') {
    return (
      <DashboardCard className="p-6">
        <div className="flex items-start gap-3 text-red-700">
          <AlertCircle size={20} />
          <p className="font-bold">{state.message}</p>
        </div>
      </DashboardCard>
    );
  }

  const { summary, users, catalog, imports, campaigns, security, errors } = state.data;
  const totals = summary.totals || {};

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'live', label: 'Live Activity' },
    { id: 'catalog', label: 'Data Catalog' },
    { id: 'bulk_import', label: 'Bulk Import Center' },
    { id: 'manual', label: 'Manual Entry' },
    { id: 'users', label: 'Users' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'imports', label: 'Dataset Imports' },
    { id: 'security', label: 'Security Monitor' },
    { id: 'errors', label: 'Error Monitor' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Founder operations</p>
        <h2 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">Operations Center</h2>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total users" value={totals.totalUsers} icon={Users} />
            <Stat label="Verified users" value={totals.verifiedUsers} icon={ShieldCheck} />
            <Stat label="Catalog leads" value={totals.totalCatalogLeads} icon={Database} />
            <Stat label="Search campaigns" value={totals.totalCampaigns} icon={Search} />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <DashboardCard className="p-5">
              <h3 className="text-xl font-bold tracking-tight mb-4">System Status</h3>
              <div className="space-y-3 text-sm font-semibold">
                <div className="flex justify-between border-b border-black/5 pb-2"><span>Database</span> <span className="text-[#137333]">Online</span></div>
                <div className="flex justify-between border-b border-black/5 pb-2"><span>Local Dataset</span> <span className="text-[#137333]">Available</span></div>
                <div className="flex justify-between border-b border-black/5 pb-2"><span>Google Maps API</span> <span className="text-black/50">Not configured</span></div>
                <div className="flex justify-between border-b border-black/5 pb-2"><span>Website Enrichment</span> <span className="text-[#137333]">Available</span></div>
                <div className="flex justify-between pb-2"><span>AI Providers</span> <span className="text-black/50">Coming next</span></div>
              </div>
            </DashboardCard>
            <MiniTable
              title="Recent Security Events"
              rows={security.slice(0, 5)}
              columns={[
                { key: 'action', label: 'Action' },
                { key: 'user', label: 'User', render: (row) => row.user?.email || '-' },
                { key: 'createdAt', label: 'Time', render: (row) => date(row.createdAt) },
              ]}
            />
          </div>
        </div>
      )}

      {activeTab === 'live' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <MiniTable
            title="Recent Security Events"
            rows={security}
            columns={[
              { key: 'action', label: 'Action' },
              { key: 'user', label: 'User', render: (row) => row.user?.email || '-' },
              { key: 'createdAt', label: 'Time', render: (row) => date(row.createdAt) },
            ]}
          />
          <MiniTable
            title="Recent Backend Errors"
            rows={errors}
            columns={[
              { key: 'route', label: 'Route' },
              { key: 'errorCode', label: 'Code' },
              { key: 'createdAt', label: 'Time', render: (row) => date(row.createdAt) },
            ]}
          />
        </div>
      )}

      {activeTab === 'catalog' && (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-3">
            <Stat label="Total Records" value={catalog.total} icon={Database} />
            <Stat label="Top Category" value={catalog.byCategory?.[0]?.count || 0} icon={Search} />
            <Stat label="Top Governorate" value={catalog.byGovernorate?.[0]?.count || 0} icon={Search} />
          </div>
          <CatalogTab />
        </div>
      )}

      {activeTab === 'bulk_import' && (
        <BulkImportCenter onSuccess={() => loadData()} />
      )}

      {activeTab === 'manual' && (
        <ManualEntryForm onSuccess={() => loadData()} />
      )}

      {activeTab === 'users' && (
        <MiniTable
          rows={users}
          columns={[
            { key: 'email', label: 'Email' },
            { key: 'role', label: 'Role' },
            { key: 'emailVerified', label: 'Verified', render: (row) => (row.emailVerified ? 'Yes' : 'No') },
            { key: 'creditsBalance', label: 'Credits' },
            { key: 'createdAt', label: 'Joined', render: r => date(r.createdAt) },
          ]}
        />
      )}

      {activeTab === 'campaigns' && (
        <MiniTable
          rows={campaigns}
          columns={[
            { key: 'name', label: 'Campaign' },
            { key: 'owner', label: 'Owner', render: (row) => row.user?.email || '-' },
            { key: 'status', label: 'Status' },
            { key: 'source', label: 'Source', render: (row) => row.latestResultSet?.sourceUsed || row.sources?.[0] || '-' },
            { key: 'resultCount', label: 'Results' },
            { key: 'createdAt', label: 'Started', render: r => date(r.createdAt) },
          ]}
        />
      )}

      {activeTab === 'imports' && (
        <MiniTable
          rows={imports}
          columns={[
            { key: 'fileName', label: 'File' },
            { key: 'status', label: 'Status' },
            { key: 'importedRows', label: 'Imported' },
            { key: 'duplicateRows', label: 'Dupes' },
            { key: 'errorRows', label: 'Errors' },
            { key: 'completedAt', label: 'Completed', render: (row) => date(row.completedAt) },
          ]}
        />
      )}

      {activeTab === 'security' && (
        <MiniTable
          rows={security}
          columns={[
            { key: 'action', label: 'Action' },
            { key: 'user', label: 'User', render: (row) => row.user?.email || '-' },
            { key: 'ipAddress', label: 'IP' },
            { key: 'createdAt', label: 'Time', render: (row) => date(row.createdAt) },
          ]}
        />
      )}

      {activeTab === 'errors' && (
        <MiniTable
          rows={errors}
          columns={[
            { key: 'requestId', label: 'Request ID' },
            { key: 'route', label: 'Route' },
            { key: 'statusCode', label: 'Status' },
            { key: 'errorCode', label: 'Code' },
            { key: 'message', label: 'Message', render: (row) => <span className="block max-w-[300px] truncate">{row.message}</span> },
            { key: 'createdAt', label: 'Time', render: (row) => date(row.createdAt) },
          ]}
        />
      )}
    </div>
  );
};

export default DashboardAdminPage;
