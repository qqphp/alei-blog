'use client';

import { Rocket } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function BackToTop() {
  const path = usePathname();
  const [visible, setVisible] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let frame = 0;
    let initial = true;
    const update = () => {
      frame = 0;
      const atFirstScreen = window.scrollY >= window.innerHeight;
      const nearTop = window.scrollY <= window.innerHeight / 4;
      const reset = initial;
      initial = false;
      setVisible((current) => reset ? atFirstScreen : nearTop ? false : atFirstScreen || current);
      if (nearTop) setLaunching(false);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', schedule);
    };
  }, [path]);

  return (
    <button
      type="button"
      className={`back-to-top${launching ? ' is-launching' : ''}`}
      hidden={!visible}
      aria-label="返回顶部"
      title="返回顶部"
      onClick={(event) => {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setLaunching(!reducedMotion);
        event.currentTarget.blur();
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      }}
      onAnimationEnd={() => setLaunching(false)}
    >
      <Rocket size={22} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );
}
