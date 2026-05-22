import { motion } from 'framer-motion';
import {
  ArrowRight,
  Camera,
  Check,
  Globe2,
  MapPin,
  MessageCircle,
  Radar,
} from 'lucide-react';

const signals = [
  { icon: Camera, label: 'Instagram active', value: 'recent posts and visual products', points: '+18' },
  { icon: MapPin, label: 'Google rating 4.7', value: 'strong trust signal from public reviews', points: '+16' },
  { icon: Globe2, label: 'No website found', value: 'no central page for menu, offers, or SEO', points: '+28' },
  { icon: MessageCircle, label: 'WhatsApp-only flow', value: 'orders depend on manual replies', points: '+14' },
];

const outputs = [
  { label: 'Opportunity score', value: '84', suffix: '/100' },
  { label: 'Service to pitch', value: 'Website + Digital Menu' },
  { label: 'Outreach angle', value: 'Convert attention into orders' },
];

const MotionDiv = motion.div;

const SignalTile = ({ signal, index }) => {
  const Icon = signal.icon;

  return (
    <MotionDiv
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay: 0.08 * index, ease: [0.16, 1, 0.3, 1] }}
      className="group relative overflow-hidden rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_45px_rgba(0,0,0,0.045)]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/40 bg-accent/15 text-black">
          <Icon size={18} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-black">{signal.label}</p>
            <span className="rounded-full bg-accent px-2 py-1 text-[11px] font-bold text-black">{signal.points}</span>
          </div>
          <p className="mt-0.5 text-xs font-medium leading-5 text-secondary">{signal.value}</p>
        </div>
      </div>
    </MotionDiv>
  );
};

const OutputTile = ({ item, index }) => (
  <MotionDiv
    initial={{ opacity: 0, x: 20 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.7, delay: 0.12 + 0.09 * index, ease: [0.16, 1, 0.3, 1] }}
    className="relative rounded-[22px] border border-black/10 bg-white p-5 shadow-[0_22px_70px_rgba(0,0,0,0.18)]"
  >
    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-secondary/60">{item.label}</p>
    <div className="mt-3 flex items-end gap-1">
      <span className="text-3xl font-bold leading-none text-primary">{item.value}</span>
      {item.suffix && <span className="pb-1 text-sm font-semibold text-secondary">{item.suffix}</span>}
    </div>
  </MotionDiv>
);

const OpportunityEngineSection = ({ onNotice }) => {
  const openAnalyzerNotice = () => {
    onNotice?.({
      title: 'Analyzer coming soon',
      message: 'The interactive analyzer will be available after the backend engine is connected.',
    });
  };

  return (
    <section id="opportunity-engine" className="relative overflow-hidden bg-white px-4 py-16 text-black scroll-mt-24 sm:px-5 md:px-8 md:py-24">
      <div className="relative mx-auto max-w-[1540px] overflow-visible">
        <div className="relative z-10">
          <div className="mx-auto max-w-4xl text-center">
            <MotionDiv
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-secondary shadow-[0_12px_35px_rgba(0,0,0,0.045)]"
            >
              <Radar size={14} className="text-black" />
              Opportunity intelligence
            </MotionDiv>

            <MotionDiv
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.8, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="mt-7 text-4xl font-bold leading-[1.04] tracking-tighter text-black sm:text-5xl md:mt-8 md:text-6xl lg:text-[5.4rem]">
                A clear scoring model for real business indicators.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-secondary sm:text-base md:mt-6 md:text-lg md:leading-8">
                Findly turns public clues into a practical recommendation: what is missing, why it matters, and what service is worth pitching.
              </p>
            </MotionDiv>
          </div>

          <div className="relative mt-10 grid items-center gap-5 lg:mt-14 lg:grid-cols-[0.95fr_1.28fr_0.95fr] lg:gap-8">
            <svg
              className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[430px] w-[760px] -translate-x-1/2 -translate-y-1/2 lg:block"
              viewBox="0 0 760 430"
              fill="none"
              aria-hidden="true"
            >
              <path className="findly-flow-line" d="M170 108 C260 108 245 205 336 205" />
              <path className="findly-flow-line findly-flow-line-delay" d="M170 318 C260 318 248 225 336 225" />
              <path className="findly-flow-line" d="M424 205 C515 205 500 108 590 108" />
              <path className="findly-flow-line findly-flow-line-delay" d="M424 225 C515 225 500 318 590 318" />
              <circle cx="336" cy="205" r="4" fill="#A6FF00" />
              <circle cx="336" cy="225" r="4" fill="#A6FF00" />
              <circle cx="424" cy="205" r="4" fill="#A6FF00" />
              <circle cx="424" cy="225" r="4" fill="#A6FF00" />
            </svg>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {signals.map((signal, index) => (
                <SignalTile key={signal.label} signal={signal} index={index} />
              ))}
            </div>

            <MotionDiv
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto min-h-[440px] w-full max-w-[540px] overflow-hidden rounded-[28px] border border-black/[0.08] bg-white p-4 shadow-[0_24px_80px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] sm:min-h-[420px] sm:rounded-[32px] sm:p-5"
            >
              <div className="absolute inset-6 rounded-[28px] border border-black/[0.04]" />

              <div className="absolute left-1/2 top-7 h-[270px] w-[270px] -translate-x-1/2 overflow-hidden rounded-full sm:top-1/2 sm:h-[350px] sm:w-[350px] sm:-translate-y-[58%]">
                <div className="findly-core-halo absolute inset-0 rounded-full" />
                <div className="findly-core-orbit absolute left-1/2 top-1/2 h-[198px] w-[198px] -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-[248px] sm:w-[248px]" />
                <div className="findly-core-orbit findly-core-orbit-slow absolute left-1/2 top-1/2 h-[236px] w-[236px] -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-[318px] sm:w-[318px]" />

                <div data-engine-core className="absolute left-1/2 top-1/2 z-10 flex h-[190px] w-[190px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-accent/55 bg-[#07110b] text-center shadow-[0_0_95px_rgba(101,154,0,0.52),0_0_30px_rgba(166,255,0,0.45),inset_0_0_62px_rgba(166,255,0,0.15)] sm:h-[226px] sm:w-[226px]">
                  <div className="absolute inset-4 rounded-full border border-white/10" />
                  <p className="relative z-10 text-[10px] font-bold uppercase tracking-[0.22em] text-white/55 sm:text-[11px] sm:tracking-[0.24em]">
                    Opportunity fit
                  </p>
                  <div className="relative z-10 mt-3 flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold leading-none text-white sm:text-6xl">84</span>
                    <span className="text-lg font-semibold text-accent">High</span>
                  </div>
                </div>
              </div>

              <div data-engine-lead className="absolute bottom-4 left-4 right-4 rounded-2xl border border-black/[0.08] bg-white/95 px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.08)] backdrop-blur-md sm:bottom-6 sm:left-6 sm:right-6 sm:bg-white/90">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div>
                    <p className="text-xs font-semibold text-secondary">Example lead</p>
                    <p className="mt-1 text-sm font-bold text-black">Local cafe, Amman</p>
                  </div>
                  <div className="w-fit rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-black">
                    manual analysis
                  </div>
                </div>
              </div>
            </MotionDiv>

            <div className="grid gap-3">
              {outputs.map((item, index) => (
                <OutputTile key={item.label} item={item} index={index} />
              ))}
            </div>
          </div>

          <MotionDiv
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 grid gap-4 rounded-[24px] border border-black/[0.08] bg-[#F7F8F6] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.055)] md:mt-8 md:grid-cols-[1fr_auto] md:items-center md:rounded-[26px] md:p-5"
          >
            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-black">
                <Check size={18} strokeWidth={2.2} />
              </div>
              <div>
                <p className="text-sm font-bold text-black">Suggested outreach</p>
                <p className="mt-1 max-w-3xl text-sm leading-7 text-secondary">
                  Your Instagram and reviews show demand. A simple website with a digital menu can reduce manual replies and make orders easier to complete.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openAnalyzerNotice}
              className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-bold text-white transition-all duration-300 hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:w-auto"
            >
              Preview analyzer
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </MotionDiv>
        </div>
      </div>
    </section>
  );
};

export default OpportunityEngineSection;
