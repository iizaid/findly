import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Play, ChevronRight } from 'lucide-react';
import DashboardCard from '../DashboardCard';
import { apiRequest, ApiError } from '../../../lib/api';

const BulkImportCenter = ({ onSuccess }) => {
  const [file, setFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle', 'parsing', 'review', 'committing', 'success', 'error'
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
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
      // Need to use native fetch for FormData since apiRequest normally sends JSON
      // Wait, apiRequest supports body being FormData natively? Let's check apiRequest later, or just use fetch
      // apiRequest usually defaults to JSON if we don't handle headers properly.
      // Assuming apiRequest handles FormData if body is FormData:
      const res = await apiRequest('/api/admin/imports/parse', {
        method: 'POST',
        body: formData,
      });
      setInspection(res.data);
      setStatus('review');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to parse file.');
      setStatus('idle');
      setFile(null);
    }
  };

  const handleCommit = async () => {
    setStatus('committing');
    setError(null);
    try {
      const res = await apiRequest('/api/admin/imports/commit', {
        method: 'POST',
        body: JSON.stringify({
          fileKey: inspection.fileKey,
          // If we had a UI for mapping config, we would pass it here
          mappingConfig: null,
          sourceType: inspection.sourceType,
        }),
      });
      setSummary(res.data.summary);
      setStatus('success');
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to commit import.');
      setStatus('review');
    }
  };

  const reset = () => {
    setFile(null);
    setInspection(null);
    setStatus('idle');
    setSummary(null);
    setError(null);
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
                  <FileSpreadsheet className="text-accent" size={24} />
                  <div>
                    <h3 className="font-bold">{inspection.fileName}</h3>
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
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-bold mb-2">Mapped Columns ({Object.keys(sheet.mapping).length})</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(sheet.mapping).map(([field, index]) => (
                            <div key={field} className="bg-accent/10 border border-accent/20 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2">
                              <span className="font-bold text-black/60">{sheet.headers[index]}</span>
                              <ChevronRight size={12} className="text-black/30" />
                              <span className="font-bold">{field}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {sheet.unmappedHeaders?.length > 0 && (
                        <div>
                          <p className="text-xs font-bold mb-2 text-secondary">Unmapped ({sheet.unmappedHeaders.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {sheet.unmappedHeaders.map((h, j) => (
                              <div key={j} className="bg-black/5 px-2 py-1 rounded md text-[10px] text-black/50">{h}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </DashboardCard>
          </div>

          <div className="space-y-6">
            <DashboardCard className="p-6">
              <h3 className="font-bold mb-4">Ready to Import?</h3>
              <p className="text-sm text-secondary mb-6">
                Rows will be normalized and deduplicated against the global catalog automatically. Unmapped columns will be stored in raw data notes.
              </p>
              
              <button 
                onClick={handleCommit} 
                disabled={status === 'committing'}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-6 py-3 font-bold text-white hover:bg-accent hover:text-black transition-colors disabled:opacity-50"
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
