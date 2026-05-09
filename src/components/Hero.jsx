import { motion } from 'framer-motion';
import AnimatedHeadline from './AnimatedHeadline';

const scrollToSection = (target) => {
  const element = document.getElementById(target);
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const Hero = ({ ready = false, currentUser, onAuthOpen, onNavigate }) => {
  const handlePrimaryCta = () => {
    if (currentUser) {
      onNavigate?.('/dashboard');
      return;
    }

    onAuthOpen?.('signup');
  };

  return (
    <section id="hero" className="relative flex min-h-[100svh] flex-grow items-center justify-center overflow-hidden bg-white px-4 pb-12 pt-24 sm:px-6 md:min-h-screen md:pt-28">
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center text-center md:mt-12">
        


        {/* Animated headline — only starts typing when ready */}
        <AnimatedHeadline text="Your Next Client Is Hiding in Plain Sight." highlightWord="Hiding" ready={ready} />

        {/* Supporting text — two-tier hierarchy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 1, delay: 2.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mb-10 max-w-3xl text-center md:mb-14"
        >
          <p className="text-xl leading-9 text-secondary sm:text-2xl md:text-3xl md:leading-relaxed">
            Discover businesses that need your service, understand why they are a real opportunity.
          </p>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 1, delay: 2.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 flex w-full flex-col items-center justify-center gap-3 px-2 sm:flex-row sm:px-0 md:mb-20 md:gap-5"
        >
          <button
            type="button"
            onClick={handlePrimaryCta}
            className="w-full rounded-full bg-primary px-8 py-4 text-sm font-bold tracking-wide text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto md:px-10 md:py-5 md:text-base"
          >
            {currentUser ? 'Open Dashboard' : 'Start Finding Leads'}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('opportunity-engine')}
            className="w-full rounded-full border border-primary/15 bg-transparent px-8 py-4 text-sm font-bold tracking-wide text-primary transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto md:px-10 md:py-5 md:text-base"
          >
            See How It Works
          </button>
        </motion.div>

      </div>
    </section>
  );
};

export default Hero;
