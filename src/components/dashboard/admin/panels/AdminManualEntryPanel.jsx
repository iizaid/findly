import { useState, useCallback } from 'react';
import { PlusCircle, Loader2, CheckCircle2, AlertCircle, Info, Star, ShieldCheck } from 'lucide-react';
import { apiRequest, ApiError } from '../../../../lib/api';

const INITIAL = {
  businessName: '', category: '', country: 'Jordan', governorate: '',
  address: '', websiteUrl: '', instagramUrl: '', facebookUrl: '', googleMapsUrl: '',
  phone: '', whatsappNumber: '', email: '', notes: '',
};

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputClass = 'h-10 w-full rounded-[14px] border border-black/[0.06] bg-[#FAFAF9] px-4 text-[13px] font-semibold text-black outline-none transition-colors focus:border-black/20 focus:bg-white placeholder:text-black/25 focus:ring-4 focus:ring-black/5';

const AdminManualEntryPanel = ({ onSuccess }) => {
  const [form, setForm] = useState(INITIAL);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const handleChange = useCallback((e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      await apiRequest('/api/admin/catalog/leads', {
        method: 'POST',
        body: JSON.stringify({ ...form, sourceType: 'MANUAL_ADMIN' }),
      });
      setStatus('success');
      setForm(INITIAL);
      onSuccess?.();
      setTimeout(() => setStatus('idle'), 3500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add record.');
      setStatus('idle');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_400px] items-start">
      {/* LEFT: FORM CARD */}
      <section className="rounded-[24px] border border-black/[0.04] bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-black/[0.03] bg-[#FAFAF9] flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-black text-white">
            <PlusCircle size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-black">Manual Data Entry</h3>
            <p className="text-[12px] font-medium text-secondary mt-0.5">Inject single records directly into the global index.</p>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {error && (
            <div className="mb-6 rounded-[16px] bg-red-50 border border-red-100 px-5 py-4 text-[13px] font-bold text-red-700 flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          {status === 'success' && (
            <div className="mb-6 rounded-[16px] bg-emerald-50 border border-emerald-100 px-5 py-4 text-[13px] font-bold text-emerald-700 flex items-start gap-3">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <p>Record verified and added to the index successfully.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Business */}
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-black/[0.04] pb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Identity</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Business Name" required>
                  <input required name="businessName" value={form.businessName} onChange={handleChange} placeholder="e.g. Al Reef Bakery" className={inputClass} />
                </Field>
                <Field label="Category">
                  <input name="category" value={form.category} onChange={handleChange} placeholder="e.g. Cafe, Tech, Agency" className={inputClass} />
                </Field>
              </div>
            </div>

            {/* Location */}
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-black/[0.04] pb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Location</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Country" required>
                  <input required name="country" value={form.country} onChange={handleChange} className={inputClass} />
                </Field>
                <Field label="Governorate / City">
                  <input name="governorate" value={form.governorate} onChange={handleChange} placeholder="e.g. Amman" className={inputClass} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Address">
                    <input name="address" value={form.address} onChange={handleChange} placeholder="Street address, building, or area" className={inputClass} />
                  </Field>
                </div>
              </div>
            </div>

            {/* Web & Social */}
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-black/[0.04] pb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Digital Footprint</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Website URL">
                  <input type="url" name="websiteUrl" value={form.websiteUrl} onChange={handleChange} placeholder="https://" className={inputClass} />
                </Field>
                <Field label="Instagram URL">
                  <input type="url" name="instagramUrl" value={form.instagramUrl} onChange={handleChange} placeholder="https://instagram.com/…" className={inputClass} />
                </Field>
                <Field label="Facebook URL">
                  <input type="url" name="facebookUrl" value={form.facebookUrl} onChange={handleChange} placeholder="https://facebook.com/…" className={inputClass} />
                </Field>
                <Field label="Google Maps URL">
                  <input type="url" name="googleMapsUrl" value={form.googleMapsUrl} onChange={handleChange} placeholder="https://maps.google.com/…" className={inputClass} />
                </Field>
              </div>
            </div>

            {/* Contact */}
            <div>
              <div className="flex items-center gap-2 mb-4 border-b border-black/[0.04] pb-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black">Direct Contact</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Phone">
                  <input name="phone" value={form.phone} onChange={handleChange} placeholder="+962…" className={inputClass} />
                </Field>
                <Field label="WhatsApp">
                  <input name="whatsappNumber" value={form.whatsappNumber} onChange={handleChange} placeholder="+962…" className={inputClass} />
                </Field>
                <Field label="Email">
                  <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="contact@…" className={inputClass} />
                </Field>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <p className="text-[11px] font-medium text-secondary">Records are immediately available in search.</p>
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-8 text-[13px] font-bold text-white transition-all hover:bg-black/80 hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                {status === 'submitting' && <Loader2 size={16} className="animate-spin" />}
                {status === 'submitting' ? 'Injecting…' : 'Inject Record'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* RIGHT: QUALITY CHECKLIST SIDEBAR */}
      <section className="rounded-[24px] border border-accent/20 bg-accent/5 p-6 shadow-sm flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={18} className="text-accent" strokeWidth={2.5} />
            <h4 className="text-[14px] font-bold text-black">Record Quality</h4>
          </div>
          <p className="text-[12px] font-medium text-black/60 leading-relaxed">
            High quality records improve campaign matching and user satisfaction. Aim for at least one direct contact method.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-[16px] bg-white border border-black/[0.04] p-4">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-black mb-3">Duplicate Prevention</h5>
            <ul className="space-y-2 text-[12px] font-medium text-secondary">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                <span>Exact Instagram URL matches are automatically merged.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                <span>Phone numbers are normalized before deduplication.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle size={14} className="text-orange-400 mt-0.5 shrink-0" />
                <span>Name + City fuzzy matching runs in the background.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-[16px] bg-white border border-black/[0.04] p-4">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-black mb-3">Enrichment Priority</h5>
            <ul className="space-y-2 text-[12px] font-medium text-secondary">
              <li className="flex items-center gap-2">
                <Star size={14} className="text-accent" />
                <span className="text-black font-bold">Instagram URL</span> (Best for B2C)
              </li>
              <li className="flex items-center gap-2">
                <Star size={14} className="text-accent" />
                <span className="text-black font-bold">Website URL</span> (Best for B2B)
              </li>
              <li className="flex items-center gap-2">
                <Info size={14} className="text-black/30" />
                <span>Google Maps URL</span> (Best for local)
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminManualEntryPanel;
