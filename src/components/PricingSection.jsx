import { motion } from 'framer-motion';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    audience: 'For testing Findly and validating the workflow.',
    price: '$0',
    cadence: 'forever',
    description: '50 Opportunity Credits / month',
    features: [
      '50 Opportunity Credits per month',
      'Manual lead analysis',
      'Basic opportunity score',
      'Detected opportunity summary',
      'Suggested service recommendation',
      '1 outreach message format',
      'Save up to 5 leads',
    ],
    muted: [],
    cta: 'Start free',
  },
  {
    name: 'Starter',
    audience: 'For freelancers who want to find and qualify leads weekly.',
    price: '$9',
    cadence: 'month',
    description: '400 Opportunity Credits / month',
    features: [
      '400 Opportunity Credits per month',
      'Manual lead analysis',
      'Saved lead library',
      'Basic filters by city, category, and service type',
      'Weighted opportunity reasons',
      'WhatsApp, Instagram DM, and email outreach formats',
      'CSV export',
      'Category-specific service suggestions',
    ],
    muted: [],
    cta: 'Choose Starter',
  },
  {
    name: 'Pro',
    audience: 'For serious freelancers and small studios doing regular prospecting.',
    price: '$29',
    cadence: 'month',
    description: '1,500 Opportunity Credits / month',
    features: [
      '1,500 Opportunity Credits per month',
      'Advanced opportunity scoring',
      'Priority filters',
      'Bulk import of user-provided business lists',
      'Personalized outreach angles',
      'Saved segments',
      'CRM-ready export columns',
      'Weekly opportunity summary',
      'Early access to future source modules',
    ],
    muted: [],
    cta: 'Choose Pro',
    featured: true,
  },
];

const PlanCard = ({ plan, index, onAuthOpen, currentUser, onNavigate }) => (
  <motion.div
    initial={{ opacity: 0, y: 28 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.75, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
    className={`relative flex min-h-[auto] flex-col rounded-[24px] border p-5 transition-all duration-300 sm:rounded-[28px] sm:p-6 md:min-h-[660px] ${
      plan.featured
        ? 'border-black bg-black text-white shadow-[0_28px_90px_rgba(0,0,0,0.18)]'
        : 'border-black/[0.08] bg-white text-black shadow-[0_18px_55px_rgba(0,0,0,0.055)] hover:border-black/[0.16]'
    }`}
  >
    {plan.featured && (
      <div className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-black">
        Best value
      </div>
    )}

    <div>
      <p className={`text-sm font-bold ${plan.featured ? 'text-white' : 'text-black'}`}>{plan.name}</p>
      <p className={`mt-2 min-h-[72px] text-sm leading-6 pr-6 sm:pr-10 ${plan.featured ? 'text-white/48' : 'text-secondary'}`}>{plan.audience}</p>
    </div>

    <div className="mt-8">
      <div className="flex items-end gap-2">
        <span className="text-4xl font-bold tracking-tighter sm:text-5xl">{plan.price}</span>
        <span className={`pb-1 text-sm font-semibold ${plan.featured ? 'text-white/45' : 'text-secondary'}`}>/{plan.cadence}</span>
      </div>
      <p className={`mt-5 min-h-[28px] text-sm font-bold leading-7 ${plan.featured ? 'text-white' : 'text-black'}`}>
        {plan.description}
      </p>
    </div>

    <button
      type="button"
      onClick={() => {
        if (currentUser) {
          onNavigate?.('/dashboard/settings');
        } else {
          onAuthOpen?.('signup', plan.name);
        }
      }}
      className={`mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        plan.featured
          ? 'bg-accent text-black hover:bg-white'
          : 'bg-black text-white hover:bg-accent hover:text-black'
      }`}
    >
      {plan.cta}
      <ArrowRight size={15} />
    </button>

    <div className={`my-7 h-px ${plan.featured ? 'bg-white/10' : 'bg-black/[0.08]'}`} />

    <div className="space-y-3">
      {plan.features.map((feature) => (
        <div key={feature} className="flex gap-3">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${plan.featured ? 'bg-accent text-black' : 'bg-accent/20 text-black'}`}>
            <Check size={13} strokeWidth={2.4} />
          </span>
          <span className={`text-sm leading-6 ${plan.featured ? 'text-white/72' : 'text-graphite'}`}>{feature}</span>
        </div>
      ))}
    </div>
  </motion.div>
);

const PricingSection = ({ onAuthOpen, currentUser, onNavigate }) => {
  return (
    <section id="pricing" className="relative overflow-hidden border-t border-black/[0.06] bg-white px-4 py-16 scroll-mt-24 sm:px-5 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1480px]">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-secondary"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Pricing
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.8, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-3xl text-4xl font-bold leading-[1.03] tracking-tighter text-black sm:text-5xl md:mt-7 md:text-7xl"
            >
              Simple credits for finding better opportunities.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.8, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-secondary/80 md:mt-6 md:text-lg"
            >
              Use Opportunity Credits across lead analysis, scoring, outreach preparation, exports, and future discovery tools.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-[24px] border border-black/[0.08] bg-[#F7F8F6] p-4 sm:rounded-[28px] sm:p-5 md:p-6"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-black">
                <ShieldCheck size={20} strokeWidth={2.1} />
              </div>
              <div>
                <p className="text-sm font-bold text-black">Built around public business data, user-provided inputs, and compliant research workflows.</p>
                <p className="mt-2 text-sm leading-7 text-secondary">
                  Credits help keep pricing flexible as Findly adds more analysis and discovery tools.
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-10 grid gap-4 md:mt-14 md:grid-cols-3">
          {plans.map((plan, index) => (
            <PlanCard key={plan.name} plan={plan} index={index} onAuthOpen={onAuthOpen} currentUser={currentUser} onNavigate={onNavigate} />
          ))}
        </div>
        
        <div className="mt-10 flex justify-center md:mt-12">
          <p className="text-center text-xs font-semibold tracking-wide text-secondary/60">
            Early pricing. Final limits may change after cost testing and product validation.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
