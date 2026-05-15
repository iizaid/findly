import { useState, useRef, useMemo } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle, Play, ArrowRight } from 'lucide-react';
import { apiRequest, ApiError } from '../../../lib/api';

const ALLOWED_TARGET_FIELDS = [
  'ignore',
  'businessName', 'category', 'country', 'governorate', 'city', 'address',
  'phone', 'whatsappNumber', 'email',
  'websiteUrl', 'instagramUrl', 'instagramUsername', 'facebookUrl', 'googleMapsUrl',
  'rating', 'reviewCount', 'notes', 'sourceUrl', 'sourceType',
];

const FIELD_LABELS = {
  ignore: 'Skip this column',
  businessName: 'Business Name',
  category: 'Category',
  country: 'Country',
  governorate: 'Governorate',
  city: 'City',
  address: 'Address',
  phone: 'Phone',
  whatsappNumber: 'WhatsApp',
  email: 'Email',
  websiteUrl: 'Website URL',
  instagramUrl: 'Instagram URL',
  instagramUsername: 'Instagram Username',
  facebookUrl: 'Facebook URL',
  googleMapsUrl: 'Google Maps URL',
  rating: 'Rating',
  reviewCount: 'Review Count',
  notes: 'Notes',
  sourceUrl: 'Source URL',
  sourceType: 'Source Type',
};

/* ============================================================== */
/*  STEP INDICATOR                                                 */
/* ============================================================== */
const STEPS = ['Upload', 'Map Columns', 'Review', 'Complete'];

const StepIndicator = ({ current }) => (
  <div className="flex items-center justify-center gap-0 mb-6">
    {STEPS.map((step, i) => {
      const isDone = i < current;
      const isActive = i === current;
      return (
        <div key={step} className="flex items-center">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
              isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-black text-white' : 'bg-black/[0.06] text-black/30'
            }`}>
              {isDone ? '✓' : i + 1}
            </div>
            <span className={`text-[12px] font-bold whitespace-nowrap ${isActive ? 'text-black' : isDone ? 'text-emerald-600' : 'text-black/30'}`}>
              {step}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mx-3 h-[2px] w-8 rounded-full ${isDone ? 'bg-emerald-400' : 'bg-black/[0.06]'}`} />
          )}
        </div>
      );
    })}
  </div>
);

/* ============================================================== */
/*  MAIN COMPONENT                                                 */
/* ============================================================== */
const BulkImportCenter = ({ onSuccess }) => {
  const [file, setFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [mappingState, setMappingState] = useState({});
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const currentStep = status === 'idle' || status === 'parsing' ? 0
    : status === 'review' ? 1
    : status === 'committing' ? 2
    : status === 'success' ? 3 : 0;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = (selectedFile) => {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx') {
      setError('Please upload a .csv or .xlsx file.');
      return;
    }
    setFile(selectedFile);
    setError(null);
    handleParse(selectedFile);
  };

  const handleParse = async (selectedFile) => {
    setStatus('parsing');
    setError(null);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await apiRequest('/api/admin/imports/parse', {
        method: 'POST',
        body: formData,
      });
      setInspection(res.data);
      
      const initialMapping = {};
      res.data.sheets.forEach(sheet => {
        if (sheet.skippedSheet) return;
        const sheetMapping = {};
        sheet.headers.forEach((header, index) => {
           const targetField = Object.keys(sheet.mapping).find(key => sheet.mapping[key] === index);
           sheetMapping[header] = targetField || 'ignore';
        });
        initialMapping[sheet.name] = sheetMapping;
      });
      setMappingState(initialMapping);
      
      setStatus('review');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to parse file.');
      setStatus('idle');
      setFile(null);
    }
  };

  const handleMappingChange = (sheetName, header, value) => {
    setMappingState(prev => ({
      ...prev,
      [sheetName]: {
        ...prev[sheetName],
        [header]: value
      }
    }));
  };

  const validationIssues = useMemo(() => {
    if (!inspection) return [];
    const issues = [];
    
    inspection.sheets.forEach(sheet => {
      if (sheet.skippedSheet) return;
      const sheetMapping = mappingState[sheet.name] || {};
      
      const targetCounts = {};
      let hasBusinessName = false;
      
      Object.entries(sheetMapping).forEach(([_header, target]) => {
        if (target === 'ignore') return;
        targetCounts[target] = (targetCounts[target] || 0) + 1;
        if (target === 'businessName') hasBusinessName = true;
      });
      
      if (!hasBusinessName) {
        issues.push(`Sheet "${sheet.name}": A column must be mapped to "businessName".`);
      }
      
      Object.entries(targetCounts).forEach(([target, count]) => {
        if (count > 1) {
          issues.push(`Sheet "${sheet.name}": Duplicate mapping for field "${target}".`);
        }
      });
    });
    
    return issues;
  }, [inspection, mappingState]);

  const handleCommit = async () => {
    if (validationIssues.length > 0) return;
    
    setStatus('committing');
    setError(null);
    
    const mappingConfig = {
      sheets: Object.entries(mappingState).map(([sheetName, mapping]) => ({
        sheetName,
        columns: Object.entries(mapping).map(([sourceHeader, targetField]) => ({
          sourceHeader,
          targetField
        }))
      }))
    };
    
    try {
      const res = await apiRequest('/api/admin/imports/commit', {
        method: 'POST',
        body: JSON.stringify({
          fileKey: inspection.fileKey,
          mappingConfig,
          sourceType: inspection.sourceType,
        }),
      });
      setSummary(res.data.summary);
      setStatus('success');
      if (onSuccess) onSuccess();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to commit import.';
      const isExpired = err?.statusCode === 404 || msg.includes('expired') || msg.includes('not found');
      setError(isExpired ? 'The uploaded file expired. Please upload it again.' : msg);
      setStatus(isExpired ? 'idle' : 'review');
      if (isExpired) { setFile(null); setInspection(null); }
    }
  };

  const reset = () => {
    setFile(null);
    setInspection(null);
    setStatus('idle');
    setSummary(null);
    setError(null);
    setMappingState({});
  };

  /* ---- SUCCESS STATE ---- */
  if (status === 'success' && summary) {
    return (
      <section className="rounded-[22px] border border-black/[0.04] bg-white p-8 shadow-sm max-w-3xl">
        <StepIndicator current={3} />
        <div className="text-center">
          <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-5">
            <CheckCircle2 size={28} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-1">Import Complete</h2>
          <p className="text-sm font-semibold text-secondary mb-6">Successfully imported records from {summary.fileName}</p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="p-4 rounded-[16px] border border-black/[0.04] bg-[#FAFAF9]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Total</p>
            <p className="text-2xl font-bold tabular-nums">{summary.totalRows}</p>
          </div>
          <div className="p-4 rounded-[16px] border border-emerald-100 bg-emerald-50/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Imported</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">{summary.importedRows}</p>
          </div>
          <div className="p-4 rounded-[16px] border border-black/[0.04] bg-[#FAFAF9]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Skipped</p>
            <p className="text-2xl font-bold tabular-nums">{summary.skippedRows}</p>
          </div>
          <div className="p-4 rounded-[16px] border border-red-100 bg-red-50/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-1">Errors / Dupes</p>
            <p className="text-2xl font-bold tabular-nums text-red-700">{summary.errorRows + summary.duplicateRows}</p>
          </div>
        </div>

        <div className="text-center">
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-2.5 text-sm font-bold text-white hover:bg-black/80 transition-colors">
            Import Another File
            <ArrowRight size={14} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-black/[0.04] bg-white p-6 shadow-sm">
        <StepIndicator current={currentStep} />

        {error && (
          <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" /> {error}
          </div>
        )}

        {/* ---- UPLOAD ZONE ---- */}
        {status === 'idle' && (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-[18px] border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
              isDragActive
                ? 'border-accent bg-accent/5 scale-[1.01]'
                : 'border-black/[0.12] hover:border-black/25 hover:bg-black/[0.01]'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])} 
              className="hidden" 
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
              aria-label="Select file to import"
            />
            <div className={`flex h-14 w-14 mx-auto items-center justify-center rounded-2xl mb-4 transition-colors ${
              isDragActive ? 'bg-accent text-black' : 'bg-black/[0.04] text-black/40'
            }`}>
              <Upload size={22} />
            </div>
            <h3 className="text-lg font-bold tracking-tight mb-1">
              {isDragActive ? 'Drop your file here' : 'Drag & drop your file here'}
            </h3>
            <p className="text-sm font-semibold text-secondary">Supports .csv and .xlsx</p>
          </div>
        )}

        {/* ---- PARSING ---- */}
        {status === 'parsing' && (
          <div className="py-14 text-center">
            <Loader2 className="animate-spin text-accent mx-auto mb-4" size={32} />
            <h3 className="text-lg font-bold tracking-tight mb-1">Parsing {file?.name}…</h3>
            <p className="text-sm font-semibold text-secondary">Analyzing sheets, columns, and detecting data types.</p>
          </div>
        )}
      </section>

      {/* ---- REVIEW & MAPPING ---- */}
      {(status === 'review' || status === 'committing') && inspection && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Main mapping area */}
          <section className="rounded-[22px] border border-black/[0.04] bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-black/[0.04] bg-[#FAFAF9]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Column Mapping</h3>
                  <p className="text-[11px] font-semibold text-secondary mt-0.5">
                    {inspection.fileName} — {inspection.sheets.reduce((acc, s) => acc + s.rowCount, 0)} rows detected
                  </p>
                </div>
                <span className="rounded-md bg-black/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary">
                  {inspection.sourceType}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-6">
              {inspection.sheets.map((sheet, i) => (
                <div key={i}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary mb-3">
                    {sheet.name} <span className="text-black/30">({sheet.rowCount} rows)</span>
                  </p>
                  
                  {sheet.skippedSheet ? (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700">
                      Skipped: {sheet.errorMessage || 'No valid headers found'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
                      <table className="w-full text-left text-sm" style={{ minWidth: '600px' }}>
                        <thead className="bg-[#FAFAF9] text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">
                          <tr className="border-b border-black/[0.06]">
                            <th className="py-2.5 px-4">Source Column</th>
                            <th className="py-2.5 px-4">Map To</th>
                            <th className="py-2.5 px-4 text-black/30">Sample</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/[0.04]">
                          {sheet.headers.map((header, j) => {
                            const currentTarget = mappingState[sheet.name]?.[header] || 'ignore';
                            const sampleValue = sheet.sampleRows?.[0]?.[j];
                            const isIgnored = currentTarget === 'ignore';
                            return (
                              <tr key={j} className={`transition-colors ${isIgnored ? 'opacity-50' : 'hover:bg-black/[0.01]'}`}>
                                <td className="py-2.5 px-4 font-bold text-black/80 text-[13px]">{header}</td>
                                <td className="py-2.5 px-4">
                                  <select
                                    value={currentTarget}
                                    onChange={(e) => handleMappingChange(sheet.name, header, e.target.value)}
                                    aria-label={`Map column ${header}`}
                                    className={`w-full rounded-lg border px-3 py-1.5 text-[13px] font-semibold outline-none transition-colors ${
                                      isIgnored
                                        ? 'border-black/[0.06] bg-[#FAFAF9] text-secondary'
                                        : 'border-black/[0.12] bg-white text-black focus:border-black/30'
                                    }`}
                                  >
                                    {ALLOWED_TARGET_FIELDS.map(f => (
                                      <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2.5 px-4 text-[12px] text-secondary truncate max-w-[180px]" title={String(sampleValue || '')}>
                                  {String(sampleValue || '—')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Sticky action panel */}
          <div className="lg:sticky lg:top-4 self-start">
            <section className="rounded-[22px] border border-black/[0.04] bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold tracking-tight mb-3">Ready to Import?</h3>
              
              {validationIssues.length > 0 ? (
                <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-[12px] text-red-700 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertCircle size={13} /> Fix mapping errors:
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {validationIssues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[12px] font-semibold text-secondary mb-4 leading-relaxed">
                  Rows will be normalized and deduplicated against the global catalog. Ignored columns will not be imported.
                </p>
              )}
              
              <button 
                type="button"
                onClick={handleCommit} 
                disabled={status === 'committing' || validationIssues.length > 0}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-bold text-white hover:bg-black/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === 'committing' ? <Loader2 className="animate-spin" size={15} /> : <Play size={14} fill="currentColor" />}
                {status === 'committing' ? 'Importing…' : 'Start Import'}
              </button>
              
              <button 
                type="button"
                onClick={reset} 
                disabled={status === 'committing'}
                className="mt-2.5 w-full text-center text-[13px] font-bold text-secondary hover:text-black transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </section>
          </div>
        </div>
      )}

      {/* ---- COMMITTING OVERLAY ---- */}
      {status === 'committing' && (
        <section className="rounded-[22px] border border-black/[0.04] bg-white p-8 shadow-sm text-center">
          <Loader2 className="animate-spin text-accent mx-auto mb-4" size={28} />
          <p className="text-sm font-bold">Importing records into the catalog…</p>
          <p className="text-[12px] text-secondary mt-1">This may take a moment for large datasets.</p>
        </section>
      )}
    </div>
  );
};

export default BulkImportCenter;
