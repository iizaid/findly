import { useState, useCallback } from 'react';
import { PlusCircle, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
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

const inputClass = 'h-10 w-full rounded-xl border border-black/[0.08] bg-[#FAFAF9] px-4 text-[13px] font-semibold text-black outline-none transition-colors focus:border-black/20 focus:bg-white placeholder:text-black/25';

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
    <section className="rounded-[22px] border border-black/[0.04] bg-white shadow-sm overflow-hidden max-w-3xl">
      {/* Header */}
      <div className="px-6 py-5 border-b border-black/[0.04] bg-[#FAFAF9]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent text-black">
            <PlusCircle size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Manual Entry</h3>
            <p className="text-[11px] font-semibold text-secondary mt-0.5">Add a single record to the global data catalog.</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-700 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" /> {error}
          </div>
        )}
        {status === 'success' && (
          <div className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-700 flex items-center gap-2">
            <CheckCircle2 size={15} className="shrink-0" /> Record added to catalog successfully.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary mb-3">Business Information</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Business Name" required>
                <input required name="businessName" value={form.businessName} onChange={handleChange} placeholder="e.g. Al Reef Bakery" className={inputClass} aria-label="Business name" />
              </Field>
              <Field label="Category">
                <input name="category" value={form.category} onChange={handleChange} placeholder="e.g. Restaurants" className={inputClass} aria-label="Business category" />
              </Field>
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary mb-3">Location</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Country" required>
                <input required name="country" value={form.country} onChange={handleChange} className={inputClass} aria-label="Country" />
              </Field>
              <Field label="Governorate / City">
                <input name="governorate" value={form.governorate} onChange={handleChange} placeholder="e.g. Amman" className={inputClass} aria-label="Governorate or city" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address">
                  <input name="address" value={form.address} onChange={handleChange} placeholder="Street address or area" className={inputClass} aria-label="Address" />
                </Field>
              </div>
            </div>
          </div>

          {/* Web & Social */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary mb-3">Web & Social</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Website URL">
                <input type="url" name="websiteUrl" value={form.websiteUrl} onChange={handleChange} placeholder="https://" className={inputClass} aria-label="Website URL" />
              </Field>
              <Field label="Instagram URL">
                <input type="url" name="instagramUrl" value={form.instagramUrl} onChange={handleChange} placeholder="https://instagram.com/…" className={inputClass} aria-label="Instagram URL" />
              </Field>
              <Field label="Facebook URL">
                <input type="url" name="facebookUrl" value={form.facebookUrl} onChange={handleChange} placeholder="https://facebook.com/…" className={inputClass} aria-label="Facebook URL" />
              </Field>
              <Field label="Google Maps URL">
                <input type="url" name="googleMapsUrl" value={form.googleMapsUrl} onChange={handleChange} placeholder="https://maps.google.com/…" className={inputClass} aria-label="Google Maps URL" />
              </Field>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary mb-3">Contact</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Phone">
                <input name="phone" value={form.phone} onChange={handleChange} placeholder="+962…" className={inputClass} aria-label="Phone number" />
              </Field>
              <Field label="WhatsApp">
                <input name="whatsappNumber" value={form.whatsappNumber} onChange={handleChange} placeholder="+962…" className={inputClass} aria-label="WhatsApp number" />
              </Field>
              <Field label="Email">
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="contact@…" className={inputClass} aria-label="Email address" />
              </Field>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary mb-3">Notes</p>
            <Field label="Internal Notes">
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Any internal notes about this record…" className={`${inputClass} h-auto py-3`} aria-label="Internal notes" />
            </Field>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-bold text-white transition-colors hover:bg-black/80 disabled:opacity-40"
            >
              {status === 'submitting' && <Loader2 size={15} className="animate-spin" />}
              {status === 'submitting' ? 'Saving…' : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default AdminManualEntryPanel;
