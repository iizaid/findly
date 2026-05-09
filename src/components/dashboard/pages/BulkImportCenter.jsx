import { useState, useRef, useMemo } from 'react';
import { Upload, Loader2, CheckCircle2, AlertCircle, Play, Settings } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import { apiRequest, ApiError } from '../../../lib/api';

const ALLOWED_TARGET_FIELDS = [
  'ignore',
  'businessName', 'category', 'country', 'governorate', 'city', 'address',
  'phone', 'whatsappNumber', 'email',
  'websiteUrl', 'instagramUrl', 'instagramUsername', 'facebookUrl', 'googleMapsUrl',
  'rating', 'reviewCount', 'notes', 'sourceUrl', 'sourceType',
];

const BulkImportCenter = ({ onSuccess }) => {
  const [file, setFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle', 'parsing', 'review', 'committing', 'success', 'error'
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [mappingState, setMappingState] = useState({});
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
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

  if (status === 'success' && summary) {
    return (
      <DashboardCard className="p-8 max-w-3xl mx-auto text-center">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-[#E6F4EA] text-[#137333] mb-6">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">Import Complete</h2>
        <p className="text-secondary mb-8">Successfully imported {summary.importedRows} leads from {summary.fileName}</p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 text-left">
          <div className="p-4 rounded-xl bg-black/5">
            <p className="text-xs font-bold uppercase text-secondary mb-1">Total</p>
            <p className="text-2xl font-bold">{summary.totalRows}</p>
          </div>
          <div className="p-4 rounded-xl bg-[#E6F4EA]/50">
            <p className="text-xs font-bold uppercase text-secondary mb-1">Imported</p>
            <p className="text-2xl font-bold text-[#137333]">{summary.importedRows}</p>
          </div>
          <div className="p-4 rounded-xl bg-black/5">
            <p className="text-xs font-bold uppercase text-secondary mb-1">Skipped</p>
            <p className="text-2xl font-bold">{summary.skippedRows}</p>
          </div>
          <div className="p-4 rounded-xl bg-red-50">
            <p className="text-xs font-bold uppercase text-secondary mb-1">Errors/Dupes</p>
            <p className="text-2xl font-bold text-red-700">{summary.errorRows + summary.duplicateRows}</p>
          </div>
        </div>

        <button onClick={reset} className="rounded-full bg-black px-8 py-3 font-bold text-white hover:bg-accent hover:text-black transition-colors">
          Import Another File
        </button>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bulk Import Center</h2>
          <p className="text-secondary text-sm mt-1">Upload and map large datasets to the global catalog.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {status === 'idle' && (
        <div 
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-black/20 rounded-2xl p-12 text-center hover:border-accent hover:bg-accent/5 cursor-pointer transition-colors"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files?.[0] && handleFileSelection(e.target.files[0])} 
            className="hidden" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
          />
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-black/5 text-black/40 mb-4">
            <Upload size={24} />
          </div>
          <h3 className="text-lg font-bold mb-1">Drag & drop your file here</h3>
          <p className="text-sm text-secondary">Supports .csv and .xlsx up to 50MB</p>
        </div>
      )}

      {status === 'parsing' && (
        <DashboardCard className="p-12 text-center">
          <Loader2 className="animate-spin text-accent mx-auto mb-4" size={32} />
          <h3 className="text-lg font-bold mb-1">Parsing {file?.name}...</h3>
          <p className="text-sm text-secondary">Analyzing sheets, columns, and detecting data types.</p>
        </DashboardCard>
      )}

      {(status === 'review' || status === 'committing') && inspection && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <DashboardCard className="p-6">
              <div className="flex items-center justify-between mb-6 border-b border-black/10 pb-4">
                <div className="flex items-center gap-3">
                  <Settings className="text-accent" size={24} />
                  <div>
                    <h3 className="font-bold">Map Columns: {inspection.fileName}</h3>
                    <p className="text-xs text-secondary">{inspection.sheets.reduce((acc, s) => acc + s.rowCount, 0)} total rows detected</p>
                  </div>
                </div>
                <div className="bg-black/5 px-3 py-1 rounded-lg text-xs font-bold uppercase">
                  {inspection.sourceType}
                </div>
              </div>

              {inspection.sheets.map((sheet, i) => (
                <div key={i} className="mb-8 last:mb-0">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-secondary mb-4">{sheet.name} ({sheet.rowCount} rows)</h4>
                  
                  {sheet.skippedSheet ? (
                    <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-bold">
                      Skipped: {sheet.errorMessage || 'No valid headers found'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-secondary">
                            <th className="py-3 pr-4 font-bold">Source Column</th>
                            <th className="py-3 pr-4 font-bold">Target Field</th>
                            <th className="py-3 font-bold text-black/40">Sample Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sheet.headers.map((header, j) => {
                            const currentTarget = mappingState[sheet.name]?.[header] || 'ignore';
                            const sampleValue = sheet.sampleRows?.[0]?.[j];
                            return (
                              <tr key={j} className="border-b border-black/5 last:border-0 hover:bg-black/5">
                                <td className="py-3 pr-4 font-bold text-black/80">{header}</td>
                                <td className="py-3 pr-4">
                                  <select
                                    value={currentTarget}
                                    onChange={(e) => handleMappingChange(sheet.name, header, e.target.value)}
                                    className="w-full rounded-lg border border-black/20 bg-white px-3 py-1.5 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                                  >
                                    {ALLOWED_TARGET_FIELDS.map(f => (
                                      <option key={f} value={f}>{f}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-3 text-black/50 truncate max-w-[200px]" title={String(sampleValue || '')}>
                                  {String(sampleValue || '-')}
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
            </DashboardCard>
          </div>

          <div className="space-y-6">
            <DashboardCard className="p-6">
              <h3 className="font-bold mb-4">Ready to Import?</h3>
              
              {validationIssues.length > 0 ? (
                <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700 space-y-2">
                  <div className="font-bold flex items-center gap-2">
                    <AlertCircle size={16} /> 
                    Please fix mapping errors:
                  </div>
                  <ul className="list-disc pl-6 opacity-90 text-xs">
                    {validationIssues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-secondary mb-6">
                  Rows will be normalized and deduplicated against the global catalog automatically. Ignored columns will not be imported.
                </p>
              )}
              
              <button 
                onClick={handleCommit} 
                disabled={status === 'committing' || validationIssues.length > 0}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-6 py-3 font-bold text-white hover:bg-accent hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'committing' ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
                {status === 'committing' ? 'Importing...' : 'Start Import'}
              </button>
              
              <button 
                onClick={reset} 
                disabled={status === 'committing'}
                className="mt-3 w-full text-center text-sm font-bold text-secondary hover:text-black transition-colors"
              >
                Cancel
              </button>
            </DashboardCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkImportCenter;
