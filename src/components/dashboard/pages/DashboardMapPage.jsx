import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, Map, MapPin, Navigation, Search } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import DashboardEmptyState from '../DashboardEmptyState';
import { apiRequest } from '../../../lib/api';

const scoreColor = (level) => {
  if (level === 'GOLD') return 'bg-yellow-400 text-black';
  if (level === 'HIGH') return 'bg-accent text-black';
  if (level === 'MEDIUM') return 'bg-blue-400 text-white';
  return 'bg-black text-white';
};

const normalizePosition = (lead, bounds) => {
  if (!lead.latitude || !lead.longitude) return { x: 50, y: 50 };

  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const x = ((lead.longitude - bounds.minLng) / lngRange) * 76 + 12;
  const y = (1 - ((lead.latitude - bounds.minLat) / latRange)) * 72 + 14;

  return {
    x: Math.min(Math.max(x, 8), 92),
    y: Math.min(Math.max(y, 8), 92),
  };
};

const DashboardMapPage = ({ onNavigate }) => {
  const [state, setState] = useState({ status: 'loading', leads: [] });
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let active = true;

    const loadMapLeads = async () => {
      try {
        const response = await apiRequest('/api/search/leads/map');
        if (active) setState({ status: 'ready', leads: response.data.leads || [] });
      } catch (error) {
        if (active) {
          setState({
            status: 'error',
            leads: [],
            message: error?.message || 'Could not load map leads.',
          });
        }
      }
    };

    loadMapLeads();

    return () => {
      active = false;
    };
  }, []);

  const cities = useMemo(() => [...new Set(state.leads.map((lead) => lead.city).filter(Boolean))], [state.leads]);
  const statuses = useMemo(() => [...new Set(state.leads.map((lead) => lead.status).filter(Boolean))], [state.leads]);

  const filteredLeads = useMemo(() => state.leads.filter((lead) => {
    if (cityFilter && lead.city !== cityFilter) return false;
    if (statusFilter && lead.status !== statusFilter) return false;
    return true;
  }), [state.leads, cityFilter, statusFilter]);

  const bounds = useMemo(() => {
    const withCoordinates = filteredLeads.filter((lead) => lead.latitude && lead.longitude);
    if (!withCoordinates.length) {
      return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
    }

    return {
      minLat: Math.min(...withCoordinates.map((lead) => lead.latitude)),
      maxLat: Math.max(...withCoordinates.map((lead) => lead.latitude)),
      minLng: Math.min(...withCoordinates.map((lead) => lead.longitude)),
      maxLng: Math.max(...withCoordinates.map((lead) => lead.longitude)),
    };
  }, [filteredLeads]);

  const selectedLead = filteredLeads.find((lead) => lead.id === selectedLeadId) || filteredLeads[0];

  return (
    <div className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_430px]">
      <DashboardCard className="overflow-hidden p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-black">
              <Map size={26} />
            </div>
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-secondary">Geographic intelligence</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tighter md:text-5xl">Lead Map</h2>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-secondary">
              Location data appears for leads collected from compliant sources that provide coordinates. No paid map key is exposed to the frontend.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/dashboard/find-leads')}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Search size={16} />
            Find Leads
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <select
            value={cityFilter}
            onChange={(event) => setCityFilter(event.target.value)}
            className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-xs font-bold outline-none focus:border-black/20 focus:bg-white"
          >
            <option value="">All cities</option>
            {cities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-xs font-bold outline-none focus:border-black/20 focus:bg-white"
          >
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#F7F8F6]">
          {state.status === 'loading' ? (
            <div className="flex min-h-[520px] items-center justify-center">
              <Loader2 size={28} className="animate-spin text-secondary" />
            </div>
          ) : state.status === 'error' ? (
            <div className="flex min-h-[520px] items-center justify-center p-6">
              <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p className="text-sm font-bold">{state.message}</p>
              </div>
            </div>
          ) : filteredLeads.length > 0 ? (
            <div className="relative min-h-[520px] overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(166,255,0,0.16),transparent_30%),linear-gradient(135deg,#ffffff_0%,#eef1ed_100%)]">
              <div className="absolute inset-0 opacity-[0.34] [background-image:linear-gradient(rgba(0,0,0,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />
              <div className="absolute left-5 top-5 rounded-2xl border border-black/[0.08] bg-white/85 px-4 py-3 text-xs font-bold text-secondary backdrop-blur">
                {filteredLeads.length} mapped lead{filteredLeads.length === 1 ? '' : 's'}
              </div>
              {filteredLeads.map((lead) => {
                const analysis = lead.analyses?.[0];
                const position = normalizePosition(lead, bounds);
                const active = selectedLead?.id === lead.id;

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white text-xs font-black shadow-[0_12px_32px_rgba(0,0,0,0.2)] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${scoreColor(analysis?.scoreLevel)} ${active ? 'scale-125 ring-4 ring-accent/25' : ''}`}
                    style={{ left: `${position.x}%`, top: `${position.y}%` }}
                    aria-label={`Select ${lead.businessName}`}
                  >
                    {analysis?.opportunityScore ?? <MapPin size={15} />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <DashboardEmptyState
                title="No mapped leads yet"
                description="Location data will appear for sources that provide coordinates, such as Google Places."
                actionLabel="Create Search Campaign"
                onAction={() => onNavigate('/dashboard/find-leads')}
              />
            </div>
          )}
        </div>
      </DashboardCard>

      <div className="space-y-5">
        <DashboardCard className="p-5 md:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Map focus</p>
          {selectedLead ? (
            <div className="mt-4">
              <h3 className="text-2xl font-bold tracking-tighter">{selectedLead.businessName}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-secondary">
                {[selectedLead.category, selectedLead.city].filter(Boolean).join(' · ') || 'Mapped lead'}
              </p>
              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl bg-[#F7F8F6] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Rating</p>
                  <p className="mt-2 text-xl font-bold">{selectedLead.rating ? `${selectedLead.rating} / 5` : 'Not available'}</p>
                </div>
                <div className="rounded-2xl bg-[#F7F8F6] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">Score</p>
                  <p className="mt-2 text-xl font-bold">{selectedLead.analyses?.[0]?.opportunityScore ?? 'Not analyzed'}</p>
                </div>
              </div>
              {selectedLead.googleMapsUrl && (
                <a
                  href={selectedLead.googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-colors hover:bg-accent hover:text-black"
                >
                  Open source map
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-7 text-secondary">
              Select a marker after running a campaign with coordinate-bearing sources.
            </p>
          )}
        </DashboardCard>

        <DashboardCard className="!bg-black p-5 text-white md:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-accent">
            <Navigation size={22} />
          </div>
          <h3 className="mt-5 text-2xl font-bold tracking-tighter">Opportunity geography without fake markers.</h3>
          <p className="mt-3 text-sm font-semibold leading-7 text-white/58">
            This view only renders leads that exist in your workspace and include latitude/longitude from compliant data sources.
          </p>
        </DashboardCard>
      </div>
    </div>
  );
};

export default DashboardMapPage;
