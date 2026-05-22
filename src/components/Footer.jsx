import { ArrowRight } from 'lucide-react';

const footerLinks = [
  {
    title: 'Platform',
    links: [
      { label: 'Product Film', target: 'product-film' },
      { label: 'Search Sources', target: 'sources' },
      { label: 'Opportunity Engine', target: 'opportunity-engine' },
      { label: 'Pricing Plans', target: 'pricing' },
    ],
  },
  {
    title: 'Who it\'s for',
    links: [
      { label: 'Freelancers' },
      { label: 'Web Agencies' },
      { label: 'Marketing Teams' },
      { label: 'Design Studios' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Log in', auth: 'login' },
      { label: 'Contact Support' },
      { label: 'Privacy Policy' },
      { label: 'Terms of Service' },
    ],
  },
];

const Footer = ({ onNotice, onAuthOpen }) => {
  const scrollToSection = (target) => {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openComingSoon = (label) => {
    onNotice?.({
      title: `${label} coming soon`,
      message: 'This front-end page is prepared, but this destination will be connected after the next product step.',
    });
  };

  const openAnalyzerNotice = () => {
    onNotice?.({
      title: 'Analyzer coming soon',
      message: 'The interactive analyzer will be available after the backend engine is connected.',
    });
  };

  const handleFooterLink = (link) => {
    if (link.target) {
      scrollToSection(link.target);
      return;
    }

    if (link.auth) {
      onAuthOpen?.(link.auth);
      return;
    }

    openComingSoon(link.label);
  };

  return (
    <footer className="border-t border-black/[0.08] bg-white px-4 py-14 text-black sm:px-5 md:px-8 md:py-16">
      <div className="mx-auto max-w-[1480px]">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <img
              src="/findly-logo-dark.png"
              alt="Findly"
              className="h-12 w-auto"
              draggable={false}
            />
            <h2 className="mt-8 max-w-3xl text-4xl font-bold leading-[1.06] tracking-tighter sm:text-5xl md:mt-10 md:text-6xl">
              Stop guessing who needs your service.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-8 text-secondary">
              Findly helps freelancers and small teams turn public business data into clear opportunities, stronger offers, and better first messages.
            </p>

            <button
              type="button"
              onClick={openAnalyzerNotice}
              className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-bold text-black transition-all duration-300 hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto md:mt-9"
            >
              Preview the analyzer
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerLinks.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">{group.title}</p>
                <div className="mt-5 space-y-3">
                  {group.links.map((link) => (
                    <button
                      key={link.label}
                      type="button"
                      onClick={() => handleFooterLink(link)}
                      className="block text-left text-sm font-medium text-graphite transition-colors duration-200 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-black/[0.08] pt-7 text-sm text-secondary md:flex-row md:items-center md:justify-between">
          <p>© 2026 Findly. All rights reserved.</p>
          <p>Public data in. Clear opportunities out.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
