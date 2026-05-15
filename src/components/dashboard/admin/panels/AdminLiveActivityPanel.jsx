import { useState, useCallback, useEffect } from 'react';
import { Search, RefreshCw, Radio, User, ShieldAlert, Bug, Activity, FileText } from 'lucide-react';
import { relTime, severityStyle } from '../admin.utils';
import { apiRequest } from '../../../../lib/api';

/* ============================================================== */
/*  EVENT STREAM COMPONENT                                         */
/* ============================================================== */
const AdminLiveActivityPanel = ({ onSelect }) => {
  const [data, setData] = useState({ logs: [], loading: true });
  const [filters, setFilters] = useState({ search: '', category: '', severity: '' });

  const fetchLogs = useCallback(async (f) => {
    try {
      const q = new URLSearchParams({ limit: '100' });
      if (f.search) q.set('search', f.search);
      if (f.category) q.set('category', f.category);
      if (f.severity) q.set('severity', f.severity);
      const res = await apiRequest(`/api/admin/activity?${q}`);
      return res.data.activity || [];
    } catch {
      return [];
    }
  }, []);

  const refresh = useCallback(async (f) => {
    setData((d) => ({ ...d, loading: true }));
    const logs = await fetchLogs(f);
    setData({ logs, loading: false });
  }, [fetchLogs]);

  useEffect(() => {
    let active = true;
    fetchLogs(filters).then((logs) => { if (active) setData({ logs, loading: false }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.severity, fetchLogs]);

  const handleSearch = (e) => {
    e.preventDefault();
    refresh(filters);
  };

  const getEventIcon = (category) => {
    switch (category?.toLowerCase()) {
      case 'auth':
      case 'admin':
      case 'users': return User;
      case 'security': return ShieldAlert;
      case 'error': return Bug;
      case 'import':
      case 'catalog': return FileText;
      default: return Activity;
    }
  };

  return (
    <div className="flex flex-col h-full rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden">
      {/* HEADER & TOOLBAR */}
      <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-black/[0.04] text-black/60">
              <Radio size={18} />
            </div>
            <div>
              <h3 className="text-[16px] font-bold tracking-tight text-black">Live Activity Stream</h3>
              <p className="text-[12px] font-medium text-secondary mt-0.5">Real-time platform & user events</p>
            </div>
          </div>
          
          <button 
            type="button" 
            onClick={() => refresh(filters)} 
            disabled={data.loading}
            className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-black/[0.06] bg-white text-black/50 hover:bg-black/[0.02] hover:text-black transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={data.loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              type="text"
              placeholder="Search events…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="h-10 w-full rounded-[14px] border border-black/[0.06] bg-white pl-9 pr-4 text-[13px] font-semibold text-black placeholder:text-black/30 outline-none transition-colors focus:border-black/20 focus:ring-4 focus:ring-black/5"
            />
          </form>
          <select 
            value={filters.category} 
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} 
            className="h-10 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
          >
            <option value="">All Categories</option>
            <option value="auth">Auth</option>
            <option value="security">Security</option>
            <option value="error">Errors</option>
            <option value="search">Search</option>
            <option value="import">Imports</option>
            <option value="admin">Admin</option>
            <option value="system">System</option>
          </select>
          <select 
            value={filters.severity} 
            onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))} 
            className="h-10 rounded-[14px] border border-black/[0.06] bg-white px-3 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
          >
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* EVENT STREAM */}
      <div className="flex-1 overflow-y-auto p-2">
        {data.loading && data.logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-black/30">
            <RefreshCw size={24} className="animate-spin mb-4" />
            <p className="text-[13px] font-bold">Loading stream...</p>
          </div>
        ) : data.logs.length > 0 ? (
          <div className="relative">
            <div className="absolute left-7 top-4 bottom-4 w-px bg-black/[0.04]" />
            <div className="space-y-1 relative z-10">
              {data.logs.map((log) => {
                const s = severityStyle(log.severity);
                const Icon = getEventIcon(log.category);
                
                return (
                  <div 
                    key={log.id}
                    onClick={() => onSelect?.(log)}
                    className="flex items-start gap-4 p-3 rounded-[16px] hover:bg-black/[0.02] transition-colors cursor-pointer group"
                  >
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-white ${s.bg}`}>
                      <Icon size={12} className={s.dot.replace('bg-', 'text-')} strokeWidth={3} />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${s.bg}`}>
                            {s.label}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">{log.category}</span>
                        </div>
                        <h4 className="text-[14px] font-bold text-black group-hover:text-accent transition-colors">
                          {(log.title || '').replace(/_/g, ' ')}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[12px] font-semibold text-black/70">{log.actorEmail || 'System'}</span>
                          <span className="text-secondary/30">•</span>
                          <span className="text-[12px] text-secondary truncate max-w-sm" title={log.description || log.route || ''}>
                            {log.description || log.route || 'No context provided'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[11px] font-bold text-secondary">{relTime(log.createdAt)}</span>
                        {log.requestId && (
                          <span className="text-[9px] font-mono text-black/30 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {log.requestId.split('-')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black/[0.02] text-black/20 mb-4">
              <Activity size={28} />
            </div>
            <h4 className="text-[15px] font-bold text-black">No activity found</h4>
            <p className="text-[13px] font-medium text-secondary mt-1">Adjust your filters or wait for new events.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLiveActivityPanel;
