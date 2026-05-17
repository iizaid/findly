import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { apiRequest } from '../../../../lib/api';

const PROVIDERS = [
  { id: 'serper', label: 'Serper.dev', role: 'SEARCH_METADATA', primary: true },
  { id: 'serpapi', label: 'SerpAPI', role: 'SEARCH_METADATA', fallback: true },
  { id: 'google_places', label: 'Google Places', role: 'LOCAL_BUSINESS' },
  { id: 'dataforseo', label: 'DataForSEO', role: 'SEARCH_METADATA', disabled: true },
  { id: 'brave', label: 'Brave Search', role: 'SEARCH_METADATA', disabled: true },
  { id: 'searchapi', label: 'SearchAPI', role: 'SEARCH_METADATA', disabled: true },
];

const statusClass = (status) => {
  if (status === 'ACTIVE' || status === 'configured') return 'bg-emerald-50 text-emerald-700';
  if (status === 'DELETED' || status === 'failed') return 'bg-amber-50 text-amber-700';
  return 'bg-black/[0.04] text-black/55';
};

const getErrorMessage = (error, fallback) => error?.message || fallback;

const SecretModal = ({ provider, mode, onClose, onSaved }) => {
  const isDelete = mode === 'delete';
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [reason, setReason] = useState('');
  const [confirmProvider, setConfirmProvider] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const canSubmit = isDelete
    ? confirmProvider === provider.provider && reason.trim().length >= 8 && !submitting
    : apiKey.trim().length > 0
      && confirmProvider === provider.provider
      && reason.trim().length >= 8
      && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (isDelete) {
        await apiRequest(`/api/admin/discovery/providers/${provider.provider}/secret`, {
          method: 'DELETE',
          body: JSON.stringify({ confirmProvider, reason: reason.trim() }),
        });
      } else {
        await apiRequest(`/api/admin/discovery/providers/${provider.provider}/secret`, {
          method: 'PUT',
          body: JSON.stringify({
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim() || null,
            role: provider.role,
            priority: provider.priority || 100,
            isPrimaryCandidate: Boolean(provider.isPrimaryCandidate),
            isFallbackCandidate: Boolean(provider.isFallbackCandidate),
            confirmProvider,
            reason: reason.trim(),
          }),
        });
        setApiKey('');
      }
      setSuccess(isDelete ? 'Dashboard key removed.' : 'Dashboard key saved.');
      setTimeout(() => {
        onSaved?.();
        onClose();
      }, 800);
    } catch (err) {
      setError(getErrorMessage(err, 'Request failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-[24px] bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-black">{isDelete ? 'Delete Dashboard Key' : 'Add / Replace Key'}</h3>
            <p className="mt-1 text-[12px] font-bold uppercase tracking-wider text-secondary">{provider.label}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-black/60 hover:bg-black/10">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
            <CheckCircle2 size={18} />
            <p className="text-sm font-bold">{success}</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
                <AlertCircle size={18} />
                <p className="text-sm font-bold">{error}</p>
              </div>
            )}

            {!isDelete && (
              <>
                <label className="mb-4 block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-black">API key</span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="none"
                    className="h-11 w-full rounded-[14px] border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
                  />
                </label>
                <label className="mb-4 block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-black">Base URL</span>
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="none"
                    placeholder="Optional, allowlisted only"
                    className="h-11 w-full rounded-[14px] border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
                  />
                </label>
              </>
            )}

            <label className="mb-4 block">
              <span className="mb-1.5 block text-[13px] font-semibold text-black">Reason</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-[14px] border border-black/[0.08] bg-white px-4 py-3 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
            </label>

            <label className="mb-5 block">
              <span className="mb-1.5 block text-[13px] font-semibold text-black">Confirm provider</span>
              <input
                type="text"
                value={confirmProvider}
                onChange={(event) => setConfirmProvider(event.target.value.toLowerCase())}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                placeholder={`Type ${provider.provider}`}
                className="h-11 w-full rounded-[14px] border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5"
              />
            </label>

            <div className="mb-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-[12px] font-bold text-yellow-900">
                {isDelete
                  ? 'This removes the dashboard-managed key. Environment keys may still remain active.'
                  : 'The key is encrypted before storage and cannot be viewed again.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-black/[0.08] bg-white text-[13px] font-bold text-black hover:bg-black/5">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="h-11 flex-1 rounded-xl bg-black text-[13px] font-bold text-white hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Saving...' : isDelete ? 'Delete Key' : 'Save Key'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const AdminDiscoveryProvidersPanel = ({ currentUser }) => {
  const [state, setState] = useState({ status: 'loading' });
  const [modal, setModal] = useState(null);
  const [testing, setTesting] = useState(null);
  const isRoot = currentUser?.role === 'ROOT';

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading' }));
    try {
      const response = await apiRequest('/api/admin/discovery/providers');
      setState({ status: 'ready', data: response.data });
    } catch (error) {
      setState({ status: 'error', message: getErrorMessage(error, 'Could not load discovery providers.') });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const providerRows = useMemo(() => {
    const byProvider = new Map((state.data?.providers || []).map((provider) => [provider.provider, provider]));
    return PROVIDERS.map((provider) => ({
      ...provider,
      ...(byProvider.get(provider.id) || { provider: provider.id, status: 'missing', source: 'missing', role: provider.role }),
    }));
  }, [state.data]);

  const testProvider = async (provider) => {
    setTesting(provider.provider);
    try {
      await apiRequest(`/api/admin/discovery/providers/${provider.provider}/test`, {
        method: 'POST',
        body: JSON.stringify({ confirmProvider: provider.provider }),
      });
      await load();
    } catch (error) {
      setState((prev) => ({ ...prev, message: getErrorMessage(error, 'Provider test failed safely.') }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-5">
      {modal && <SecretModal provider={modal.provider} mode={modal.mode} onClose={() => setModal(null)} onSaved={load} />}

      <section className="rounded-[24px] border border-black/[0.04] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Discovery Control</p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-black">Discovery Providers</h3>
            <p className="mt-2 max-w-2xl text-[13px] font-semibold leading-6 text-secondary">
              Manage encrypted keys for Serper, SerpAPI, and Google Places. LocalDataset remains the first discovery layer.
            </p>
          </div>
          <button type="button" onClick={load} disabled={state.status === 'loading' || state.status === 'refreshing'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 text-[12px] font-bold text-black hover:bg-black/[0.03] disabled:opacity-50">
            <RefreshCw size={14} className={state.status === 'refreshing' ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {!state.data?.secretManagementConfigured && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            <p className="text-[13px] font-bold">Dashboard discovery secret management is not configured on this server.</p>
          </div>
        )}

        {state.message && (
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
            <p className="text-[13px] font-bold">{state.message}</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {providerRows.map((provider) => (
          <div key={provider.id} className="rounded-[22px] border border-black/[0.04] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h4 className="text-[16px] font-extrabold text-black">{provider.label}</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClass(provider.status)}`}>
                      {provider.status || 'missing'}
                    </span>
                    <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black/55">
                      {provider.source || 'missing'}
                    </span>
                  </div>
                </div>
              </div>
              {provider.configured && <ShieldCheck size={18} className="text-emerald-600" />}
            </div>

            <div className="mt-5 grid gap-3 text-[12px] font-semibold text-secondary sm:grid-cols-2">
              <p>Role: <span className="font-bold text-black">{provider.role || 'SEARCH_METADATA'}</span></p>
              <p>Base URL: <span className="font-bold text-black">{provider.baseUrlConfigured ? 'Configured' : 'Default/env'}</span></p>
              <p>Fingerprint: <span className="font-bold text-black">{provider.fingerprint || 'Not dashboard-managed'}</span></p>
              <p>Last status: <span className="font-bold text-black">{provider.lastStatus || 'Not tested'}</span></p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setModal({ mode: 'save', provider })} disabled={!isRoot || provider.disabled || !state.data?.secretManagementConfigured} className="inline-flex h-9 items-center gap-2 rounded-xl bg-black px-3 text-[12px] font-bold text-white hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40">
                <KeyRound size={14} />
                Add / Replace key
              </button>
              <button type="button" onClick={() => testProvider(provider)} disabled={!isRoot || testing === provider.provider || provider.source !== 'dashboard'} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[12px] font-bold text-black hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40">
                <Zap size={14} />
                {testing === provider.provider ? 'Testing...' : 'Test'}
              </button>
              <button type="button" onClick={() => setModal({ mode: 'delete', provider })} disabled={!isRoot || provider.source !== 'dashboard'} className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 text-[12px] font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40">
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default AdminDiscoveryProvidersPanel;
