'use client';

import { useContent } from '@/components/content-provider';

import Link from 'next/link';
import { Sun, Moon, Rss, Link2, ArrowUpRight } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import './site-chrome.css';


export function LifeNavigation() {
  const life = useContent().site.life.map(item => [item.name, item.href]);
  const path = usePathname();
  return <nav className="life-page-nav" aria-label="生活栏目">{life.map(([name, href]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{name}<span aria-hidden="true">↗</span></Link>)}</nav>;
}

const themeChangeEvent = 'site-theme-change';
const themeSnapshot = () => localStorage.getItem('site-theme') === 'fresh';
const serverThemeSnapshot = () => false;
function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(themeChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(themeChangeEvent, onStoreChange);
  };
}

export function SiteHeader() {
  const { site } = useContent();
  const links = site.links.map(item => [item.name, item.href]);
  const sites = site.sites.map(item => [item.name, item.href]);
  const life = site.life.map(item => [item.name, item.href]);
  const path = usePathname();
  const inSection = (items: string[][]) => items.some(([, href]) => path === href || path.startsWith(`${href}/`));
  const fresh = useSyncExternalStore(
    subscribeToTheme,
    themeSnapshot,
    serverThemeSnapshot,
  );
  useEffect(() => {
    document.documentElement.classList.toggle('fresh-theme', fresh);
  }, [fresh]);
  const setTheme = (value: string) => {
    localStorage.setItem('site-theme', value === 'fresh' ? 'fresh' : 'default');
    window.dispatchEvent(new Event(themeChangeEvent));
  };
  return <header className="site-header"><Link className="brand" href="/"><span className="brand-mark">{site.mark}</span><span>{site.name}</span></Link><nav>{links.map(([name, href]) => <Link className={path === href || path.startsWith(`${href}/`) ? 'active' : ''} href={href} key={href}>{name}</Link>)}<Sheet><SheetTrigger className={`nav-drawer-trigger${inSection(sites) ? ' active' : ''}`} aria-current={inSection(sites) ? 'true' : undefined}><span>+</span> 网站</SheetTrigger><SheetContent className="life-drawer"><SheetTitle>{"网站索引"}</SheetTitle><div>{sites.map(([name, href], index) => <Link href={href} key={href}><span>0{index + 1}</span><b>{name}</b><i>↗</i></Link>)}</div></SheetContent></Sheet><Sheet><SheetTrigger className={`nav-drawer-trigger${inSection(life) ? ' active' : ''}`} aria-current={inSection(life) ? 'true' : undefined}><span>+</span> 生活</SheetTrigger><SheetContent className="life-drawer"><SheetTitle>{"生活索引"}</SheetTitle><div>{life.map(([name, href], index) => <Link href={href} key={href}><span>0{index + 1}</span><b>{name}</b><i>↗</i></Link>)}</div></SheetContent></Sheet></nav><DropdownMenu><DropdownMenuTrigger className="theme-toggle" aria-label={`切换主题，当前${fresh ? '清风' : '明月'}`} title={`当前${fresh ? '清风' : '明月'}`}>
    {fresh ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
  </DropdownMenuTrigger><DropdownMenuContent align="end" className="theme-menu"><DropdownMenuRadioGroup value={fresh ? 'fresh' : 'default'} onValueChange={setTheme}><DropdownMenuRadioItem value="fresh"><Sun size={17} aria-hidden="true" />清风</DropdownMenuRadioItem><DropdownMenuRadioItem value="default"><Moon size={17} aria-hidden="true" />明月</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></header>;
}

function FooterSocialIcon({ icon }: { icon: string }) {
  if (icon === 'rss') return <Rss size={18} aria-hidden="true" />;
  if (icon === 'link') return <Link2 size={18} aria-hidden="true" />;
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {icon === 'github' ? <path d="M9 22v-4c-4 1-4-2-6-3m12 7v-4c0-1-.3-2-1-2 4-.5 7-2 7-6 0-2-.7-3-2-4 .3-1 .3-3-.2-4L15 4a14 14 0 0 0-6 0L5.2 2C4.7 3 4.7 5 5 6c-1.3 1-2 2-2 4 0 4 3 5.5 7 6-.7.3-1 1-1 2" />
      : icon === 'bilibili' ? <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="m7 2 3 4m7-4-3 4M8 11v3m8-3v3m-7 3h6" /></>
      : icon === 'wechat' ? <><path d="M14 13c0 3-3 5-6 5l-4 2 1-4c-2-1-3-3-3-5 0-4 4-7 8-7 4 0 7 2 8 5" /><path d="M22 15c0 2-1 4-3 5l1 3-4-2c-4 0-7-2-7-5s3-6 7-6 6 2 6 5Z" /><path d="M7 9h.1M12 9h.1M14 15h.1M18 15h.1" /></>
      : icon === 'zhihu' ? <><path d="m5 3-2 5m1-2h7M2 11h10M7 6v7c0 4-2 6-4 8m4-7 4 5" /><path d="M15 6h6v13h-3l-3 3V6Z" /></>
      : icon === 'xiaohongshu' ? <><path d="M6 4v16m-3-9-1 5m7-5 1 5m3-12-2 5h4l-3 5h4m-5 5h5M18 5h3v14m-4 0h5" /></>
      : icon === 'douyin' ? <path d="M14 3v13a4 4 0 1 1-4-4v3a1 1 0 1 0 1 1V3h3c0 3 2 5 5 5v3a8 8 0 0 1-5-2" />
      : icon === 'qq' ? <><path d="M7 9V7a5 5 0 0 1 10 0v2c1 2 2 4 2 7l2 3-3-1c-1 2-3 3-6 3s-5-1-6-3l-3 1 2-3c0-3 1-5 2-7Z" /><path d="M7 10c3 2 7 2 10 0M8 20l-2 2h5m5-2 2 2h-5M10 6v1m4-1v1m-3 3h2" /></>
      : icon === 'x' ? <><path d="M4 3h4l12 18h-4L4 3Z" /><path d="m20 3-7 8m-2 2-7 8" /></>
      : icon === 'youtube' ? <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3V9Z" /></>
      : icon === 'telegram' ? <><path d="m2 10 20-7-4 18-6-5-4 3v-6L2 10Z" /><path d="m8 13 10-6-6 9" /></>
      : icon === 'discord' ? <><path d="m8 5-4 1c-2 4-3 8-2 12l5 2 2-3m7-12 4 1c2 4 3 8 2 12l-5 2-2-3M8 5l1-2m7 2-1-2M6 15c4 3 8 3 12 0M8 7c3-1 5-1 8 0" /><ellipse cx="8" cy="12" rx="1" ry="1.5" /><ellipse cx="16" cy="12" rx="1" ry="1.5" /></>
      : icon === 'linkedin' ? <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 10v7m0-10h.01M11 17v-7m0 3a3 3 0 0 1 6 0v4" /></>
      : icon === 'facebook' ? <path d="M14 22V13h3l1-4h-4V6c0-1 1-2 2-2h2V1h-3c-3 0-5 2-5 5v3H7v4h3v9" />
        : <><path d="M19 12c3 5-3 9-9 9S1 17 3 13c2-3 7-6 9-6 2 0 1 3 1 3s4-2 6 2ZM17 7c2-1 4 1 3 3m-2-8c4-1 7 3 5 7" /><ellipse cx="10" cy="15" rx="4" ry="2.5" /><path d="M9 15h.1" /></>}
  </svg>;
}

export function SiteFooter() {
  const { site } = useContent();
  return <footer className="site-footer">
    <div className="footer-brand"><Link className="brand" href="/"><span className="brand-mark">{site.mark}</span><span>{site.name}</span></Link><p>{site.footer}</p></div>
    <nav aria-label="页脚导航">{site.footerLinks.map((item, index) => <Link href={item.href} key={index}>{item.name}</Link>)}
      {site.footerLink.trim() && site.footerUrl.trim() && <Link className="footer-contact" href={site.footerUrl}>{site.footerLink}</Link>}
    </nav>
    <div className="footer-socials">{site.footerSocialLinks.filter((item) => item.name.trim() && item.icon && item.href.trim()).map((item, index) =>
      <Link href={item.href} target="_blank" rel="noopener noreferrer" key={index} aria-label={item.name} title={item.name}><FooterSocialIcon icon={item.icon} /></Link>)}
    </div>
    <div className="footer-bottom"><small>{site.copyright}</small>
      {site.footerMotto.trim() && <p>{site.footerMotto}<ArrowUpRight size={14} aria-hidden="true" /></p>}
    </div>
  </footer>;
}
export function PageIntro({ title, text }: { title: string; text: string }) {
  return <section className="page-intro"><h1>{title}</h1><p>{text}</p></section>;
}
