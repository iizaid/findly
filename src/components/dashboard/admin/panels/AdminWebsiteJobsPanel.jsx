import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Globe2, Play, RefreshCw } from 'lucide-react';
import {
  createWebsiteEnrichmentJob,
  getWebsiteEnrichmentJob,
  getWebsiteEnrichmentJobs,
  processWebsiteEnrichmentJob,
} from '../../../../lib/api';

const statusClass = (status) => {
  if (status === 'COMPLETED') return 'bg-emerald-50 text-emerald-700';
  if (status === 'RUNNING' || status === 'QUEUED') return 'bg-blue-50 text-blue-700';
  if (status === 'FAILED') return 'bg-red-50 text-red-700';
  return 'bg-black/[0.04] text-black/55';
};

const progressLabel = (job) => {
  const done = (job.succeededItems || 0) + (job.failedItems || 0) + (job.skippedItems || 0);
  return `${done}/${job.totalItems || 0}`;
};

const AdminWebsiteJobsPanel = () => {
  const [jobsState, setJobsState] = useState({ status: 'loading', jobs: [] });
  const [selectedJob, setSelectedJob] = useState(null);
  const [limit, setLimit] = useState(10);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const loadJobs = useCallback(async () => {
    setError(null);
    const response = await getWebsiteEnrichmentJobs({ limit: 20 });
    setJobsState({ status: 'ready', jobs: response.data.jobs || [] });
  }, []);

  const loadJobDetail = useCallback(async (jobId) => {
    const response = await getWebsiteEnrichmentJob(jobId);
    setSelectedJob(response.data.job);
  }, []);

  useEffect(() => {
    let active = true;
    loadJobs().catch((err) => {
      if (active) setJobsState({ status: 'error', jobs: [], message: err.message || 'Could not load website jobs.' });
    });
    return () => { active = false; };
  }, [loadJobs]);

  const createRecentJob = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await createWebsiteEnrichmentJob({
        targetType: 'CATALOG_LEAD',
        mode: 'RECENT_CATALOG_LEADS_WITH_WEBSITE',
        limit: Number(limit),
        forceRefresh,
      });
      await loadJobs();
      setSelectedJob(response.data.job);
    } catch (err) {
      setError(err.message || 'Could not create website enrichment job.');
    } finally {
      setSubmitting(false);
    }
  };

  const processSelected = async () => {
    if (!selectedJob?.id) return;
    setProcessing(true);
    setError(null);
    try {
      const response = await processWebsiteEnrichmentJob(selectedJob.id);
      setSelectedJob(response.data.job);
      await loadJobs();
    } catch (err) {
      setError(err.message || 'Could not process website enrichment job.');
    } finally {
      setProcessing(false);
    }
  };

  const activeJob = useMemo(
    () => selectedJob || jobsState.jobs[0] || null,
    [jobsState.jobs, selectedJob],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-[22px] border border-black/[0.04] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Admin-only workflow</p>
            <h3 className="mt-2 text-xl font-extrabold text-black">Website Intelligence Jobs</h3>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-secondary">
              Run safe homepage metadata enrichment for a capped set of existing catalog leads. Jobs do not crawl sites, create leads, or expose raw HTML.
            </p>
          </div>
          <button
            type="button"
            onClick={loadJobs}
            className="inline-flex items-center gap-2 rounded-[12px] border border-black/[0.08] px-4 py-2 text-sm font-bold text-black/70 hover:bg-black/[0.03]"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[140px_auto_auto] md:items-end">
          <label className="text-sm font-bold text-black">
            Limit
            <input
              type="number"
              min="1"
              max="25"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              className="mt-1 w-full rounded-[12px] border border-black/[0.08] px-3 py-2 text-sm font-semibold outline-none focus:border-black/30"
            />
          </label>
          <label className="flex items-center gap-2 rounded-[12px] border border-black/[0.06] px-3 py-2 text-sm font-bold text-black/70">
            <input
              type="checkbox"
              checked={forceRefresh}
              onChange={(event) => setForceRefresh(event.target.checked)}
              className="h-4 w-4"
            />
            Force refresh recent evidence
          </label>
          <button
            type="button"
            onClick={createRecentJob}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-black px-4 py-2.5 text-sm font-bold text-white hover:bg-black/80 disabled:opacity-50"
          >
            <Globe2 size={16} />
            Create recent-leads job
          </button>
        </div>
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-[14px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="rounded-[22px] border border-black/[0.04] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-black">Recent jobs</h4>
            <span className="text-xs font-bold text-secondary">{jobsState.jobs.length} loaded</span>
          </div>
          {jobsState.status === 'loading' && <p className="text-sm font-semibold text-secondary">Loading jobs...</p>}
          {jobsState.status === 'error' && <p className="text-sm font-semibold text-red-700">{jobsState.message}</p>}
          {jobsState.status === 'ready' && jobsState.jobs.length === 0 && (
            <p className="text-sm font-semibold text-secondary">No website enrichment jobs yet.</p>
          )}
          <div className="space-y-2">
            {jobsState.jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => loadJobDetail(job.id)}
                className={`w-full rounded-[14px] border px-3 py-3 text-left transition ${
                  activeJob?.id === job.id ? 'border-black/20 bg-black/[0.03]' : 'border-black/[0.05] hover:bg-black/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${statusClass(job.status)}`}>{job.status}</span>
                  <span className="text-xs font-bold text-secondary">{progressLabel(job)}</span>
                </div>
                <p className="mt-2 truncate text-xs font-semibold text-black/60">{job.id}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-black/[0.04] bg-white p-5 shadow-sm">
          {!activeJob ? (
            <p className="text-sm font-semibold text-secondary">Select or create a job to review safe item status.</p>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${statusClass(activeJob.status)}`}>{activeJob.status}</span>
                    <span className="text-xs font-bold text-secondary">{progressLabel(activeJob)} processed</span>
                  </div>
                  <h4 className="mt-2 text-base font-extrabold text-black">Job detail</h4>
                  <p className="mt-1 text-xs font-semibold text-secondary">Force refresh: {activeJob.forceRefresh ? 'yes' : 'no'}</p>
                </div>
                <button
                  type="button"
                  onClick={processSelected}
                  disabled={processing || activeJob.status === 'COMPLETED'}
                  className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-black px-4 py-2.5 text-sm font-bold text-white hover:bg-black/80 disabled:opacity-50"
                >
                  <Play size={15} />
                  Process next batch
                </button>
              </div>

              <div className="mt-5 overflow-hidden rounded-[16px] border border-black/[0.05]">
                <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr] bg-black/[0.02] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-secondary">
                  <span>Lead</span>
                  <span>Status</span>
                  <span>Findings</span>
                </div>
                {(activeJob.items || []).map((item) => (
                  <div key={item.id} className="grid grid-cols-[1.2fr_0.8fr_0.8fr] items-center gap-2 border-t border-black/[0.05] px-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-black">{item.businessName || item.catalogLeadId}</p>
                      <p className="truncate text-xs font-semibold text-secondary">{item.websiteUrl || 'No website URL'}</p>
                    </div>
                    <div>
                      <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${statusClass(item.status)}`}>{item.status}</span>
                      {item.cached && <span className="ml-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">cached</span>}
                      {item.errorMessage && <p className="mt-1 text-xs font-semibold text-red-700">{item.errorMessage}</p>}
                    </div>
                    <div className="text-xs font-semibold text-secondary">
                      {item.signalsSummary ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 size={13} />
                          {item.signalsSummary.opportunities || 0} opp / {item.signalsSummary.positives || 0} pos
                        </span>
                      ) : 'Not processed'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminWebsiteJobsPanel;
