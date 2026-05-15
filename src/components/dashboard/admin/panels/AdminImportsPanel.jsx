import { FolderInput, AlertTriangle, Clock, FileText } from 'lucide-react';
import { fmt, relTime, importStatusStyle } from '../admin.utils';

/* ============================================================== */
/*  IMPORT PIPELINE COMPONENT                                      */
/* ============================================================== */
const AdminImportsPanel = ({ imports = [], onSelect }) => {
  // Summary Stats
  const total = imports.length;
  const completed = imports.filter(i => i.status === 'COMPLETED').length;
  const failed = imports.filter(i => i.status === 'FAILED').length;
  
  const totalRowsProcessed = imports.reduce((acc, i) => acc + (i.importedRows || 0) + (i.duplicateRows || 0) + (i.errorRows || 0), 0);
  const totalImported = imports.reduce((acc, i) => acc + (i.importedRows || 0), 0);
  const totalDuplicates = imports.reduce((acc, i) => acc + (i.duplicateRows || 0), 0);
  const totalErrors = imports.reduce((acc, i) => acc + (i.errorRows || 0), 0);

  const successRate = totalRowsProcessed > 0 ? Math.round((totalImported / totalRowsProcessed) * 100) : 0;

  // Filename formatter
  const getHumanName = (fileName, index) => {
    if (!fileName) return `Import Batch #${imports.length - index}`;
    // If it looks like a long UUID or hash with .csv
    if (/^[0-9a-fA-F-]{20,}/.test(fileName)) {
      return `Import Batch #${imports.length - index}`;
    }
    return fileName.replace(/^test-mapping-.*\.csv$/, 'Test File Import').replace(/\.csv$/i, '');
  };

  return (
    <div className="space-y-6">
      {/* PIPELINE SUMMARY */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Batches Processed</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-black leading-none">{fmt(total)}</span>
            <span className="text-[12px] font-semibold text-secondary">
              ({completed} OK, {failed} failed)
            </span>
          </div>
        </div>
        
        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Rows</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-black leading-none">{fmt(totalRowsProcessed)}</span>
          </div>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Added to Catalog</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600 leading-none">{fmt(totalImported)}</span>
            <span className="text-[12px] font-semibold text-emerald-600/70">
              {successRate}% rate
            </span>
          </div>
        </div>

        <div className="rounded-[20px] border border-black/[0.04] bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">Dropped</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-black/60 leading-none">{fmt(totalDuplicates + totalErrors)}</span>
            <span className="text-[12px] font-semibold text-secondary">
              ({fmt(totalDuplicates)} dup, {fmt(totalErrors)} err)
            </span>
          </div>
        </div>
      </section>

      {/* PIPELINE LIST */}
      <section className="rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-black/[0.03] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-black">Import Pipeline</h3>
            <p className="text-[13px] font-medium text-secondary mt-0.5">Recent batch processing jobs</p>
          </div>
          <button className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-4 py-2 text-[12px] font-bold text-black/70 hover:bg-black/[0.02] hover:text-black transition-colors">
            <FolderInput size={14} />
            Bulk Import
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {imports.length > 0 ? (
            <div className="divide-y divide-black/[0.03]">
              {imports.map((imp, idx) => {
                const s = importStatusStyle(imp.status);
                const isFail = imp.status === 'FAILED';
                const totalBatch = (imp.importedRows || 0) + (imp.duplicateRows || 0) + (imp.errorRows || 0);
                const progress = totalBatch > 0 ? Math.round(((imp.importedRows || 0) / totalBatch) * 100) : 0;
                
                return (
                  <div 
                    key={imp.id} 
                    onClick={() => onSelect?.(imp)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-[#FAFAF9] transition-colors cursor-pointer group gap-4"
                  >
                    {/* Left: Identity */}
                    <div className="flex items-start gap-4 sm:w-1/3">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${isFail ? 'bg-red-50 text-red-600' : 'bg-black/[0.03] text-black/50'}`}>
                        {isFail ? <AlertTriangle size={18} /> : <FileText size={18} />}
                      </div>
                      <div>
                        <h4 className="text-[14px] font-bold text-black group-hover:text-accent transition-colors">
                          {getHumanName(imp.fileName, idx)}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${s.bg}`}>
                            {s.label}
                          </span>
                          <span className="text-[11px] font-semibold text-secondary flex items-center gap-1">
                            <Clock size={10} />
                            {imp.completedAt || imp.failedAt ? relTime(imp.completedAt || imp.failedAt) : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Metrics */}
                    <div className="grid grid-cols-3 gap-6 sm:w-1/3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Imported</p>
                        <p className="text-[15px] font-extrabold text-emerald-600">{fmt(imp.importedRows)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Duplicates</p>
                        <p className="text-[15px] font-bold text-black/60">{fmt(imp.duplicateRows)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Errors</p>
                        <p className={`text-[15px] font-bold ${imp.errorRows > 0 ? 'text-red-500' : 'text-black/60'}`}>{fmt(imp.errorRows)}</p>
                      </div>
                    </div>

                    {/* Right: Progress */}
                    <div className="sm:w-1/4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-secondary">Success Rate</span>
                        <span className="text-[11px] font-bold text-black">{progress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-black/[0.04] overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${isFail ? 'bg-red-400' : progress === 100 ? 'bg-emerald-500' : 'bg-accent'} transition-all`} 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black/[0.02] text-black/20 mb-4">
                <FolderInput size={28} />
              </div>
              <h4 className="text-[15px] font-bold text-black">No imports yet</h4>
              <p className="text-[13px] font-medium text-secondary mt-1">Start by uploading a dataset.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminImportsPanel;
