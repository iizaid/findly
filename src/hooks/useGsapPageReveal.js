import { useLayoutEffect } from 'react';
import { gsap } from 'gsap';

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

export const useGsapPageReveal = (scopeRef, options = {}) => {
  useLayoutEffect(() => {
    if (!scopeRef?.current || prefersReducedMotion()) return undefined;

    const context = gsap.context(() => {
      const revealItems = gsap.utils.toArray(options.selector || '[data-gsap-reveal]');
      const staggerItems = gsap.utils.toArray(options.staggerSelector || '[data-gsap-stagger]');
      const barItems = gsap.utils.toArray(options.barSelector || '[data-gsap-bar]');

      if (revealItems.length) {
        gsap.fromTo(revealItems, {
          autoAlpha: 0,
          y: options.y ?? 12,
        }, {
          autoAlpha: 1,
          y: 0,
          duration: options.duration ?? 0.45,
          stagger: options.stagger ?? 0.04,
          ease: options.ease ?? 'power3.out',
          clearProps: 'opacity,visibility,transform',
        });
      }

      if (staggerItems.length) {
        gsap.fromTo(staggerItems, {
          autoAlpha: 0,
          y: 12,
        }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.4,
          stagger: 0.04,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
          delay: 0.06,
        });
      }

      if (barItems.length) {
        barItems.forEach((item) => {
          const targetWidth = item.dataset.gsapBarWidth || item.style.width || '0%';
          gsap.fromTo(item, {
            width: '0%',
          }, {
            width: targetWidth,
            duration: 0.5,
            ease: 'power3.out',
            delay: 0.1,
          });
        });
      }
    }, scopeRef);

    return () => context.revert();
  }, [scopeRef, options.barSelector, options.duration, options.ease, options.selector, options.stagger, options.staggerSelector, options.y]);
};

export default useGsapPageReveal;
