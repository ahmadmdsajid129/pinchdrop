import { useState, useEffect } from 'react';
import type { Transition } from 'framer-motion';

export interface MotionConfig {
  reducedMotion: boolean;
  toggleReducedMotion: () => void;
  springTransition: Transition;
  fadeTransition: Transition;
}

export function useMotionPreference(): MotionConfig {
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('pinchdrop_reduced_motion');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem('pinchdrop_reduced_motion');
      if (saved === null) {
        setReducedMotion(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleReducedMotion = () => {
    setReducedMotion((prev) => {
      const next = !prev;
      localStorage.setItem('pinchdrop_reduced_motion', String(next));
      return next;
    });
  };

  // High performance 60fps spring vs instant accessible transition
  const springTransition: Transition = reducedMotion
    ? { duration: 0.05, ease: 'linear' }
    : { type: 'spring', stiffness: 380, damping: 26, mass: 0.75 };

  const fadeTransition: Transition = reducedMotion
    ? { duration: 0.05, ease: 'linear' }
    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] };

  return {
    reducedMotion,
    toggleReducedMotion,
    springTransition,
    fadeTransition,
  };
}
