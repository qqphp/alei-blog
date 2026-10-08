'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { BackToTop } from './back-to-top';

export function SiteFloatingTools({ children }: { children?: ReactNode }) {
  const path = usePathname();
  const container = useRef<HTMLDivElement>(null);
  const isAdmin = path === '/admin' || path.startsWith('/admin/');

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const footer = document.querySelector('.site-footer');
      const lift = footer ? Math.max(0, window.innerHeight - footer.getBoundingClientRect().top + 16) : 0;
      const rocketHeight = element.querySelector<HTMLElement>('.back-to-top')?.offsetHeight ?? 0;
      const dock = element.querySelector<HTMLElement>('.music-dock');
      // Keep room for the rocket and usable player controls; taller content scrolls inside the dock.
      const reserved = rocketHeight + (dock ? Math.min(dock.scrollHeight, 180) + (rocketHeight ? 12 : 0) : 0);
      const bottom = Math.min(lift, Math.max(0, window.innerHeight - 16 - reserved));
      element.style.setProperty('--floating-footer-bottom', `${bottom}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    observer.observe(element);
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [path]);

  if (isAdmin) return null;
  return <div className="site-floating-tools" ref={container}><BackToTop />{children}</div>;
}
