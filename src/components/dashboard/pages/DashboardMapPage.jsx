import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Map as MapIcon,
  MapPin,
  RefreshCcw,
  Route,
  SlidersHorizontal,
} from 'lucide-react';
import DashboardCard from '../DashboardCard';
import { getGeoEnrichmentJob, getLeadMap, startLeadMapEnrichment } from '../../../lib/api';
import { safeExternalUrl } from '../../../lib/urlSafety';
import useGsapPageReveal from '../../../hooks/useGsapPageReveal';

const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL?.trim() || '';
const MAP_ENABLED = String(import.meta.env.VITE_LEAD_MAP_ENABLED ?? 'true') !== 'false';
const MAP_PREVIEW_MODE = String(import.meta.env.VITE_MAP_PREVIEW_MODE ?? 'false') === 'true';
const DEFAULT_CENTER = [
  Number(import.meta.env.VITE_MAP_DEFAULT_CENTER_LNG ?? 35.91),
  Number(import.meta.env.VITE_MAP_DEFAULT_CENTER_LAT ?? 31.95),
];
const DEFAULT_ZOOM = Number(import.meta.env.VITE_MAP_DEFAULT_ZOOM ?? 6);

const scoreBadgeClass = (scoreLevel) => {
  if (scoreLevel === 'GOLD') return 'bg-yellow-300 text-black';
  if (scoreLevel === 'HIGH') return 'bg-[#B6FF00] text-black';
  if (scoreLevel === 'MEDIUM') return 'bg-lime-200 text-black';
  return 'bg-black text-white';
};

const markerColor = (scoreLevel) => {
  if (scoreLevel === 'GOLD') return '#FACC15';
  if (scoreLevel === 'HIGH') return '#B6FF00';
  if (scoreLevel === 'MEDIUM') return '#D9FF75';
  return '#111111';
};

const parseRouteSelection = (search) => {
  const params = new URLSearchParams(search);
  return {
    leadIds: String(params.get('leadIds') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    listId: params.get('listId') || null,
  };
};

const buildMarkerElement = ({ lead, active = false }) => {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'findly-map-marker';
  element.style.width = '46px';
  element.style.height = '46px';
  element.style.borderRadius = '16px';
  element.style.border = active ? '3px solid rgba(17,17,17,0.18)' : '2px solid rgba(17,17,17,0.06)';
  element.style.background = markerColor(lead.scoreLevel);
  element.style.boxShadow = active ? '0 20px 36px rgba(0,0,0,0.18)' : '0 14px 28px rgba(0,0,0,0.12)';
  element.style.color = '#111111';
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = 'center';
  element.style.fontWeight = '800';
  element.style.fontSize = '15px';
  element.style.transform = active ? 'translateY(-2px)' : 'translateY(0)';
  element.style.transition = 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease';
  element.style.cursor = 'pointer';
  element.textContent = String(lead.score ?? '•');
  return element;
};

const fitToLeads = (map, leads) => {
  if (!map || !leads.length) return;
  if (leads.length === 1) {
    map.flyTo({
      center: [leads[0].longitude, leads[0].latitude],
      zoom: Math.max(DEFAULT_ZOOM, 13),
      speed: 1,
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  leads.forEach((lead) => bounds.extend([lead.longitude, lead.latitude]));
  map.fitBounds(bounds, {
    padding: 80,
    duration: 900,
    maxZoom: 14,
  });
};

const MapOverlay = ({
  title,
  description,
  actions = [],
  diagnostics = [],
}) => (
  <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-5">
    <div className="pointer-events-auto w-full max-w-xl rounded-[28px] border border-black/[0.08] bg-white/92 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Lead Map</p>
      <h3 className="mt-2 text-2xl font-bold tracking-tight text-black">{title}</h3>
      <p className="mt-3 text-[14px] font-semibold leading-6 text-black/60">{description}</p>
      {diagnostics.length > 0 && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {diagnostics.map((item) => (
            <div key={item.label} className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/45">{item.label}</p>
              <p className="mt-1 text-[15px] font-bold text-black">{item.value}</p>
            </div>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-[13px] font-semibold transition-colors ${action.secondary ? 'border border-black/[0.08] bg-white text-black hover:bg-black/[0.03]' : 'bg-black text-white hover:bg-black/85'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
);

const DashboardMapPage = ({ onNavigate }) => {
  const pageRef = useRef(null);
  const routeSearch = window.location.search;
  const selection = useMemo(() => parseRouteSelection(routeSearch), [routeSearch]);
  const [previewMode, setPreviewMode] = useState(MAP_PREVIEW_MODE);
  const [state, setState] = useState({
    status: selection.leadIds.length || selection.listId ? 'loading' : 'idle',
    mappable: [],
    notMappable: [],
    summary: null,
  });
  const [activeLeadId, setActiveLeadId] = useState(null);
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accuracyFilter, setAccuracyFilter] = useState('');
  const [hoverLeadId, setHoverLeadId] = useState(null);
  const [jobState, setJobState] = useState({ submitting: false, polling: false, message: '' });
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new globalThis.Map());

  useGsapPageReveal(pageRef);

  useEffect(() => {
    if (!selection.leadIds.length && !selection.listId) {
      setState({ status: 'idle', mappable: [], notMappable: [], summary: null });
      return;
    }

    let active = true;
    setState((current) => ({ ...current, status: 'loading' }));
    getLeadMap(selection)
      .then((response) => {
        if (!active) return;
        const payload = response.data || {};
        setState({
          status: 'ready',
          mappable: payload.mappable || [],
          notMappable: payload.notMappable || [],
          summary: payload.summary || null,
        });
        setActiveLeadId((payload.mappable || [])[0]?.id || null);
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: 'error',
          mappable: [],
          notMappable: [],
          summary: null,
          message: error?.message || 'Could not load the lead map.',
        });
      });

    return () => {
      active = false;
    };
  }, [selection]);

  const filteredMappable = useMemo(() => state.mappable.filter((lead) => {
    if (cityFilter && lead.city !== cityFilter) return false;
    if (categoryFilter && lead.category !== categoryFilter) return false;
    if (accuracyFilter && lead.geoAccuracy !== accuracyFilter) return false;
    return true;
  }), [state.mappable, cityFilter, categoryFilter, accuracyFilter]);

  const visibleLeads = filteredMappable.slice(0, 100);

  useEffect(() => {
    if (!MAP_ENABLED || !MAP_STYLE_URL || !mapContainerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    const markers = markersRef.current;

    return () => {
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((entry) => entry.marker.remove());
    markersRef.current.clear();

    if (!visibleLeads.length) {
      map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, speed: 0.8 });
      return;
    }

    visibleLeads.forEach((lead, index) => {
      const element = buildMarkerElement({ lead, active: false });
      element.style.opacity = '0';
      element.style.transform = 'translateY(12px)';

      const popup = new maplibregl.Popup({
        offset: 18,
        closeButton: false,
        closeOnClick: false,
      }).setHTML(`
        <div style="min-width:180px;padding:2px 2px 1px;">
          <div style="font-weight:800;color:#111111;font-size:14px;line-height:1.35;">${lead.businessName}</div>
          <div style="margin-top:4px;color:#5f6673;font-size:12px;font-weight:600;">${[lead.category, lead.city, lead.country].filter(Boolean).join(' · ')}</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([lead.longitude, lead.latitude])
        .setPopup(popup)
        .addTo(map);

      element.addEventListener('click', () => {
        setActiveLeadId(lead.id);
        marker.togglePopup();
        map.flyTo({
          center: [lead.longitude, lead.latitude],
          zoom: Math.max(map.getZoom(), 13),
          speed: 1,
        });
      });

      window.setTimeout(() => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      }, index * 18);

      markersRef.current.set(lead.id, { marker, popup });
    });

    fitToLeads(map, visibleLeads);
  }, [visibleLeads]);

  useEffect(() => {
    markersRef.current.forEach((entry, leadId) => {
      const lead = visibleLeads.find((item) => item.id === leadId);
      if (!lead) return;
      const active = leadId === (hoverLeadId || activeLeadId);
      const element = entry.marker.getElement();
      element.style.background = markerColor(lead.scoreLevel);
      element.style.border = active ? '3px solid rgba(17,17,17,0.18)' : '2px solid rgba(17,17,17,0.06)';
      element.style.boxShadow = active ? '0 20px 36px rgba(0,0,0,0.18)' : '0 14px 28px rgba(0,0,0,0.12)';
      element.style.transform = active ? 'translateY(-2px)' : 'translateY(0)';
    });
  }, [activeLeadId, hoverLeadId, visibleLeads]);

  const activeLead = visibleLeads.find((lead) => lead.id === activeLeadId) || visibleLeads[0] || null;
  const activeWebsiteUrl = safeExternalUrl(activeLead?.websiteUrl);
  const diagnostics = state.summary?.diagnostics || {};
  const cities = [...new Set(state.mappable.map((lead) => lead.city).filter(Boolean))];
  const categories = [...new Set(state.mappable.map((lead) => lead.category).filter(Boolean))];
  const accuracies = [...new Set(state.mappable.map((lead) => lead.geoAccuracy).filter(Boolean))];

  const runEnrichment = async () => {
    try {
      setJobState({ submitting: true, polling: false, message: '' });
      const response = await startLeadMapEnrichment(selection);
      const jobId = response.data?.job?.id;
      if (!jobId) {
        setJobState({ submitting: false, polling: false, message: 'Geo enrichment was queued.' });
        return;
      }

      setJobState({ submitting: false, polling: true, message: 'Preparing reliable coordinates...' });

      let attempts = 0;
      while (attempts < 60) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const job = await getGeoEnrichmentJob(jobId);
        const status = job.data?.job?.status;
        const summary = job.data?.job?.summary || null;
        if (status === 'COMPLETED') {
          const refreshed = await getLeadMap(selection);
          setState({
            status: 'ready',
            mappable: refreshed.data?.mappable || [],
            notMappable: refreshed.data?.notMappable || [],
            summary: refreshed.data?.summary || null,
          });
          setJobState({
            submitting: false,
            polling: false,
            message: `Location enrichment completed: ${summary?.resolvedItems ?? 0} resolved, ${summary?.lowConfidenceItems ?? 0} low-confidence, ${summary?.failedItems ?? 0} unresolved.`,
          });
          return;
        }
        if (status === 'FAILED' || status === 'CANCELLED') {
          setJobState({ submitting: false, polling: false, message: job.data?.job?.errorMessage || 'Location enrichment stopped.' });
          return;
        }
      }

      setJobState({ submitting: false, polling: false, message: 'Location enrichment is still running. Refresh this page in a moment.' });
    } catch (error) {
      setJobState({ submitting: false, polling: false, message: error?.message || 'Could not start location enrichment.' });
    }
  };

  const missingMapSetup = !MAP_ENABLED || !MAP_STYLE_URL;
  const hasSelection = !!(selection.leadIds.length || selection.listId);
  const showPreviewOverlay = !hasSelection || previewMode;
  const showNoCoordinatesOverlay = hasSelection && !visibleLeads.length && !missingMapSetup;

  const overlay = missingMapSetup
    ? {
        title: 'Map style is not configured',
        description: 'Set VITE_MAP_STYLE_URL to a production-safe MapLibre style URL. Example: https://api.maptiler.com/maps/streets/style.json?key=YOUR_KEY',
        diagnostics: [{ label: 'Missing env', value: 'VITE_MAP_STYLE_URL' }],
        actions: [{ label: 'Open settings', onClick: () => onNavigate('/dashboard/settings') }],
      }
    : showPreviewOverlay
      ? {
          title: 'Map preview mode',
          description: 'Select leads or run a campaign to place verified businesses here. The map stays visible so you can inspect layout and style before you have map-ready leads.',
          diagnostics: [{ label: 'Preview center', value: 'Amman region' }],
          actions: [
            { label: 'Find Leads', onClick: () => onNavigate('/dashboard/find-leads') },
            { label: 'Lead Lists', onClick: () => onNavigate('/dashboard/lead-lists'), secondary: true },
          ],
        }
      : showNoCoordinatesOverlay
        ? {
            title: 'No reliable coordinates yet',
            description: 'The map is ready, but the selected leads still need stronger location evidence before they can be placed here.',
            diagnostics: [
              { label: 'Low confidence', value: diagnostics.lowConfidenceCount ?? 0 },
              { label: 'No result', value: diagnostics.providerNoResultCount ?? 0 },
              { label: 'Bad response', value: diagnostics.providerBadResponseCount ?? 0 },
              { label: 'Rate limited', value: diagnostics.providerRateLimitedCount ?? 0 },
              { label: 'Insufficient input', value: diagnostics.skippedInsufficientInputCount ?? 0 },
            ],
            actions: [{ label: 'Enrich locations', onClick: runEnrichment }],
          }
        : null;

  return (
    <div ref={pageRef} className="grid min-h-[calc(100vh-132px)] gap-5 xl:grid-cols-[minmax(0,1.1fr)_410px]" data-gsap-reveal>
      <div data-gsap-stagger>
        <DashboardCard className="overflow-hidden p-5 md:p-7">
          <div className="flex flex-col gap-4 border-b border-black/[0.06] pb-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Geographic intelligence</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-black md:text-4xl">Lead Map</h2>
              <p className="mt-3 max-w-3xl text-[14px] font-semibold leading-6 text-black/55">
                Findly only maps leads with reliable coordinates. Preview mode keeps the live map visible even before results are mappable.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fitToLeads(mapRef.current, visibleLeads)}
                disabled={!visibleLeads.length || missingMapSetup}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-black/[0.03] disabled:opacity-40"
              >
                <Route size={15} />
                Fit to leads
              </button>
              <button
                type="button"
                onClick={runEnrichment}
                disabled={jobState.submitting || jobState.polling || (!selection.leadIds.length && !selection.listId)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-black px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black/85 disabled:opacity-40"
              >
                {(jobState.submitting || jobState.polling) ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                Enrich locations
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode((value) => !value)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-[13px] font-semibold text-black transition-colors hover:bg-black/[0.03]"
              >
                <MapIcon size={15} />
                {previewMode ? 'Hide preview' : 'Preview map'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/dashboard/map')}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-4 text-[13px] font-semibold text-black transition-colors hover:bg-black/[0.03]"
              >
                <SlidersHorizontal size={15} />
                Clear selection
              </button>
            </div>
          </div>

          {jobState.message && (
            <div className="mt-5 rounded-2xl border border-black/[0.06] bg-[#F7F8F6] px-4 py-3 text-[13px] font-semibold text-black/65">
              {jobState.message}
            </div>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-4" data-gsap-stagger>
            <div className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-secondary">Selected leads</p>
              <p className="mt-2 text-2xl font-bold text-black">{state.summary?.accessibleCount ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-[#B6FF00]/70 bg-[#F6FFD2] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-black/55">Mapped leads</p>
              <p className="mt-2 text-2xl font-bold text-black">{state.summary?.mappableCount ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-secondary">Needs enrichment</p>
              <p className="mt-2 text-2xl font-bold text-black">{state.summary?.notMappableCount ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-secondary">Map threshold</p>
              <p className="mt-2 text-2xl font-bold text-black">{state.summary?.minConfidenceToMap ?? 0}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6" data-gsap-stagger>
            <div className="rounded-2xl border border-black/[0.06] bg-white p-3 text-xs font-bold text-black/70">Resolved: {diagnostics.resolvedCount ?? 0}</div>
            <div className="rounded-2xl border border-black/[0.06] bg-white p-3 text-xs font-bold text-black/70">Low confidence: {diagnostics.lowConfidenceCount ?? 0}</div>
            <div className="rounded-2xl border border-black/[0.06] bg-white p-3 text-xs font-bold text-black/70">No result: {diagnostics.providerNoResultCount ?? 0}</div>
            <div className="rounded-2xl border border-black/[0.06] bg-white p-3 text-xs font-bold text-black/70">Bad response: {diagnostics.providerBadResponseCount ?? 0}</div>
            <div className="rounded-2xl border border-black/[0.06] bg-white p-3 text-xs font-bold text-black/70">Rate limited: {diagnostics.providerRateLimitedCount ?? 0}</div>
            <div className="rounded-2xl border border-black/[0.06] bg-white p-3 text-xs font-bold text-black/70">Insufficient input: {diagnostics.skippedInsufficientInputCount ?? 0}</div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2" data-gsap-stagger>
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-[13px] font-semibold text-black">
              <option value="">All cities</option>
              {cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-[13px] font-semibold text-black">
              <option value="">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={accuracyFilter} onChange={(event) => setAccuracyFilter(event.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-[#F7F8F6] px-3 text-[13px] font-semibold text-black">
              <option value="">All accuracy levels</option>
              {accuracies.map((accuracy) => <option key={accuracy} value={accuracy}>{accuracy}</option>)}
            </select>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-[30px] border border-black/[0.08] bg-[#F7F8F6]">
            {missingMapSetup ? (
              <div className="min-h-[560px] bg-[#F7F8F6]" />
            ) : (
              <div ref={mapContainerRef} className="min-h-[560px] w-full" />
            )}

            {state.status === 'loading' && (
              <div className="absolute inset-0 z-[6] flex items-center justify-center bg-white/72 backdrop-blur-sm">
                <Loader2 size={28} className="animate-spin text-secondary" />
              </div>
            )}

            {state.status === 'error' && (
              <div className="absolute inset-0 z-[6] flex items-center justify-center p-6">
                <div className="flex max-w-lg items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-bold">{state.message}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex h-9 items-center justify-center rounded-full bg-red-600 px-4 text-xs font-bold text-white transition-colors hover:bg-red-700"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('/dashboard/find-leads')}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-red-200 bg-white px-4 text-xs font-bold text-red-700 transition-colors hover:bg-red-50"
                      >
                        Back to Find Leads
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {overlay && state.status !== 'loading' && state.status !== 'error' && (
              <MapOverlay
                title={overlay.title}
                description={overlay.description}
                diagnostics={overlay.diagnostics}
                actions={overlay.actions}
              />
            )}
          </div>

          {state.summary?.markerLimitApplied && (
            <p className="mt-3 text-[12px] font-semibold text-black/55">
              Showing first 100 mapped leads. Refine your selection to focus the map.
            </p>
          )}
        </DashboardCard>
      </div>

      <div className="space-y-5" data-gsap-stagger>
        <DashboardCard className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Mapped leads</p>
          <div className="mt-4 space-y-3">
            {visibleLeads.length ? visibleLeads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onMouseEnter={() => setHoverLeadId(lead.id)}
                onMouseLeave={() => setHoverLeadId(null)}
                onClick={() => {
                  setActiveLeadId(lead.id);
                  const markerEntry = markersRef.current.get(lead.id);
                  const popup = markerEntry?.marker?.getPopup?.();
                  if (popup && !popup.isOpen()) markerEntry.marker.togglePopup();
                  mapRef.current?.flyTo({
                    center: [lead.longitude, lead.latitude],
                    zoom: Math.max(mapRef.current?.getZoom?.() || DEFAULT_ZOOM, 13),
                    speed: 1,
                  });
                }}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${lead.id === activeLeadId ? 'border-[#B6FF00] bg-[#F6FFD2]' : 'border-black/[0.06] bg-white hover:border-black/10 hover:bg-[#FBFBFB]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-black">{lead.businessName}</p>
                    <p className="mt-1 text-[12px] font-semibold text-black/55">{[lead.category, lead.city, lead.country].filter(Boolean).join(' · ') || 'Mapped lead'}</p>
                  </div>
                  <span className={`inline-flex min-w-[44px] items-center justify-center rounded-2xl px-3 py-2 text-[13px] font-black ${scoreBadgeClass(lead.scoreLevel)}`}>
                    {lead.score ?? '—'}
                  </span>
                </div>
              </button>
            )) : (
              <p className="text-[13px] font-semibold text-black/55">
                {hasSelection ? 'No mapped leads match the current filters.' : 'Select leads to inspect mapped businesses here.'}
              </p>
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Needs verification</p>
          <div className="mt-4 space-y-3">
            {state.notMappable.length ? state.notMappable.map((lead) => (
              <div key={lead.id} className="rounded-2xl border border-black/[0.06] bg-[#F7F8F6] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black/60">
                    <MapPin size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-black">{lead.businessName}</p>
                    <p className="mt-1 text-[12px] font-semibold text-black/55">{lead.reason}</p>
                    <p className="mt-2 text-[11px] font-semibold text-black/40">
                      {[lead.city, lead.country, lead.geoProvider, lead.geoAccuracy, lead.geoFailureReason].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-[13px] font-semibold text-black/55">No unresolved location records are waiting right now.</p>
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="bg-black p-5 text-white md:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B6FF00] text-black">
            <MapIcon size={22} />
          </div>
          <h3 className="mt-5 text-2xl font-bold tracking-tight">No fake markers.</h3>
          <p className="mt-3 text-sm font-semibold leading-7 text-white/65">
            Findly renders a lead only when the saved coordinates pass validation and meet the configured confidence threshold.
          </p>
          {activeWebsiteUrl && (
            <a
              href={activeWebsiteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black transition-colors hover:bg-[#B6FF00]"
            >
              Open website
              <ExternalLink size={15} />
            </a>
          )}
        </DashboardCard>
      </div>
    </div>
  );
};

export default DashboardMapPage;
