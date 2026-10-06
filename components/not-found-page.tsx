import './not-found.css';
import Link from 'next/link';

export function NotFoundPage() {
  return <main className="missing-page">
    <div className="missing-layout">
      <section className="missing-copy" aria-labelledby="missing-title">
        <p className="missing-eyebrow"><span />页面走失 · 404</p>
        <h1 id="missing-title">这里被飞船<br />搬空了<span>。</span></h1>
        <p className="missing-description">你寻找的页面可能已移动，或还没抵达这片宇宙。<br className="missing-desktop-break" />先回首页，继续探索。</p>
        <Link className="missing-home" href="/">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
          返回博客首页
        </Link>
        <p className="missing-coordinate" aria-hidden="true">坐标 4 / 0 / 4　·　信号暂时中断</p>
      </section>
      <div className="missing-art" aria-hidden="true">
        <svg viewBox="0 0 720 580" fill="none">
          <defs>
            <linearGradient id="missing-beam" x1="360" y1="186" x2="360" y2="505" gradientUnits="userSpaceOnUse"><stop stopColor="var(--missing-beam)" stopOpacity=".52" /><stop offset="1" stopColor="var(--missing-beam)" stopOpacity="0" /></linearGradient>
            <linearGradient id="missing-hull" x1="282" y1="138" x2="435" y2="190" gradientUnits="userSpaceOnUse"><stop stopColor="var(--missing-metal-light)" /><stop offset="1" stopColor="var(--missing-metal)" /></linearGradient>
            <linearGradient id="missing-glass" x1="326" y1="95" x2="401" y2="154" gradientUnits="userSpaceOnUse"><stop stopColor="var(--missing-glass-light)" /><stop offset="1" stopColor="var(--missing-glass)" /></linearGradient>
            <radialGradient id="missing-glow"><stop stopColor="var(--missing-beam)" stopOpacity=".12" /><stop offset="1" stopColor="var(--missing-beam)" stopOpacity="0" /></radialGradient>
          </defs>
          <ellipse cx="365" cy="297" rx="292" ry="261" fill="url(#missing-glow)" />
          <g className="missing-orbit" stroke="var(--missing-line)" strokeWidth="1"><ellipse cx="361" cy="291" rx="284" ry="221" transform="rotate(-24 361 291)" /><ellipse cx="361" cy="291" rx="246" ry="270" strokeDasharray="3 12" transform="rotate(35 361 291)" /></g>
          <text className="missing-number" x="360" y="388" textAnchor="middle">404</text>
          <g stroke="var(--missing-line)" strokeLinecap="round"><path d="M66 149h16m-8-8v16M594 378h20m-10-10v20M119 435h12m-6-6v12" /></g>
          <g fill="var(--missing-star)"><circle cx="126" cy="205" r="3" /><circle cx="581" cy="172" r="3" /><circle cx="620" cy="289" r="2" /><circle cx="194" cy="82" r="2" /><circle cx="473" cy="485" r="2" /><circle cx="536" cy="425" r="2" /></g>
          <g className="missing-planet"><circle cx="555" cy="98" r="22" fill="var(--missing-warm)" /><ellipse cx="555" cy="98" rx="39" ry="10" transform="rotate(-24 555 98)" stroke="var(--missing-star)" strokeWidth="2" /><path d="M541 84a22 22 0 0 1 32 28" stroke="var(--missing-background)" strokeWidth="9" opacity=".2" /></g>
          <ellipse cx="357" cy="500" rx="181" ry="24" fill="var(--missing-beam)" opacity=".055" />
          <path className="missing-beam" d="M337 184h48L526 496Q360 539 195 496L337 184Z" fill="url(#missing-beam)" />
          <g className="missing-beam-lines" stroke="var(--missing-beam)" strokeOpacity=".16"><path d="m347 194-79 268m94-261 6 261m7-262 78 268" /></g>
          <g className="missing-paper missing-paper-one"><rect x="217" y="421" width="61" height="79" rx="5" transform="rotate(-16 217 421)" fill="var(--missing-paper)" stroke="var(--missing-paper-edge)" /><path d="m232 438 27-8m-24 19 25-7m-22 18 20-6" stroke="var(--missing-paper-edge)" strokeWidth="3" strokeLinecap="round" /></g>
          <g className="missing-paper missing-paper-two"><rect x="411" y="359" width="75" height="58" rx="6" transform="rotate(13 411 359)" fill="var(--missing-card)" stroke="var(--missing-paper-edge)" /><path d="m427 378 8 2m8 2 22 5m-40 1 32 8" stroke="var(--missing-paper-edge)" strokeWidth="3" strokeLinecap="round" /><circle cx="466" cy="382" r="4" fill="var(--missing-warm)" /></g>
          <g className="missing-paper missing-paper-three"><path d="m334 444 22-17 24 16-2 31-42 1-2-31Z" fill="var(--missing-warm)" /><path d="m346 450 21-1m-20 10 12-1" stroke="var(--missing-background)" strokeWidth="3" strokeLinecap="round" /></g>
          <g className="missing-small-star"><path d="m310 329 3-10 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" fill="var(--missing-star)" /></g>
          <g className="missing-ufo">
            <path d="M315 147c0-64 92-64 92 0" fill="url(#missing-glass)" stroke="var(--missing-metal-light)" strokeWidth="2" />
            <path d="M331 119c4-10 15-17 28-18" stroke="var(--missing-glass-light)" strokeWidth="4" strokeLinecap="round" opacity=".6" />
            <ellipse cx="361" cy="166" rx="105" ry="27" fill="var(--missing-metal)" />
            <path d="M258 156c16-13 61-24 103-24s87 11 103 24c-15 22-60 31-103 31s-88-9-103-31Z" fill="url(#missing-hull)" stroke="var(--missing-metal-light)" />
            <ellipse cx="361" cy="185" rx="27" ry="7" fill="var(--missing-beam)" />
            <path d="M279 158c24 9 52 14 82 14s58-5 82-14" stroke="var(--missing-metal-light)" opacity=".55" />
            <g className="missing-ufo-lights" fill="var(--missing-beam)"><ellipse cx="286" cy="167" rx="4" ry="2" /><ellipse cx="322" cy="176" rx="4" ry="2" /><ellipse cx="399" cy="176" rx="4" ry="2" /><ellipse cx="435" cy="167" rx="4" ry="2" /></g>
            <path d="M358 93V81" stroke="var(--missing-metal-light)" strokeWidth="2" /><circle cx="358" cy="78" r="4" fill="var(--missing-warm)" />
          </g>
          <path d="M191 519h91m-71 8h32m219-8h47" stroke="var(--missing-line)" strokeLinecap="round" />
        </svg>
        <span className="missing-art-caption">最后一次目击：这片星域</span>
      </div>
    </div>
  </main>;
}
