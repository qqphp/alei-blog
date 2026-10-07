import Image from 'next/image';
import Link from 'next/link';
import { Box, FileText, MessageSquare, ArrowUpRight, ArrowRight } from 'lucide-react';
import { HeroGarden } from '@/components/hero-garden';
import { getPublicContent, getRecentArticles, getRecentProjects, getPublishedContentCounts } from '@/lib/cms-server';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import './home.css';
import { columnMetadata, absoluteUrl } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';

export function generateMetadata() { return columnMetadata('/'); }

export default async function Home() {
  const [{ home, site }, latestWriting, latestProjects, counts] = await Promise.all([
    getPublicContent(['home', 'site']), getRecentArticles(3), getRecentProjects(3), getPublishedContentCounts(),
  ]);
  const statistics = [
    { label: '笔墨成篇', text: `${counts.articles} 篇文章`, Icon: FileText },
    { label: '匠心成作', text: `${counts.projects} 个项目`, Icon: Box },
    { label: '随心札记', text: `${counts.stories} 则说说`, Icon: MessageSquare },
  ];

  return (
    <main className="site-shell home-page">
      <SiteHeader />
      <JsonLd value={{ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: absoluteUrl('/') }} />
      <div className="home-hero-surface">
        <div className="home-hero-guide" aria-hidden="true"><i /><span /></div>
        <section className="hero hero-live home-hero" id="top" aria-labelledby="home-title">
          <div className="hero-copy">
            <p className="home-eyebrow">{home.eyebrow}</p>
            <h1 id="home-title">{home.title.split(/\r?\n/).map((line, index) => <span className="home-title-line" key={index}>{line || '\u00a0'}</span>)}</h1>
            <p className="home-description">{home.description}</p>
            <div className="home-actions">
              <Link className="home-button home-button-primary" href="/projects">查看项目 <ArrowUpRight aria-hidden="true" size={18} /></Link>
              <Link className="home-button" href="/about">关于我</Link>
            </div>
          </div>
          <div className="home-hero-art">
            <HeroGarden />
            {home.heroArtTopText.trim() && <p className="home-art-handwriting home-art-top" aria-hidden="true">{home.heroArtTopText}</p>}
            {home.heroArtBottomText.trim() && <p className="home-art-bottom" aria-hidden="true">{home.heroArtBottomText}</p>}
          </div>
        </section>
        <section className="home-now home-container" aria-label="已发布内容统计">
          <p className="home-now-label">积累</p>
          <div className="home-now-items">{statistics.map(({ label, text, Icon }) => (
            <div className="home-now-item" key={label}>
              <span className="home-now-icon"><Icon size={21} aria-hidden="true" /></span>
              <div><span>{label}</span><p>{text}</p></div>
            </div>
          ))}</div>
        </section>
      </div>

      <section className="home-latest home-container" aria-labelledby="latest-title">
        <div className="home-section-head">
          <div><p className="home-eyebrow">LATEST</p><h2 id="latest-title">最新文章</h2></div>
          <Link className="home-more" href="/writing">查看全部文章 <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className="home-articles">
          {latestWriting.map((entry, index) => (
            <Link className={`home-article${index === 0 ? ' home-article-featured' : ''}`} href={`/writing/${entry.slug}`} key={entry.slug}>
              <div className="home-article-cover">
                {entry.cover ? <Image src={entry.cover} width={900} height={600} priority={index === 0}
                  sizes={index === 0 ? '(max-width: 599px) calc(100vw - 40px), (max-width: 899px) calc(100vw - 64px), (max-width: 1264px) 52vw, 640px' : '(max-width: 599px) calc(100vw - 40px), (max-width: 899px) 45vw, 180px'} alt="" />
                  : <span className="home-cover-placeholder">{entry.category}</span>}
                <span className="home-category">{entry.category}</span>
              </div>
              <div className="home-article-content">
                <time dateTime={entry.date.replaceAll('.', '-')}>{entry.date}</time>
                <h3>{entry.title}</h3><p>{entry.excerpt}</p>
                <ArrowRight className="home-card-arrow" size={19} aria-hidden="true" />
              </div>
            </Link>
          ))}
          {!latestWriting.length && <p className="home-empty">还没有已发布的文章。</p>}
        </div>
      </section>

      <section className="home-work home-container" aria-labelledby="work-title">
        <div className="home-section-head">
          <div><p className="home-eyebrow">SELECTED WORK</p><h2 id="work-title">精选项目</h2></div>
          <Link className="home-more" href="/projects">查看全部项目 <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className="home-project-grid">
          {latestProjects.map((project) => {
            const cover = project.images.find((image) => image.src);
            return <Link className="home-project-card" href={`/projects?project=${project.id}`} key={project.id}>
              <div className="home-project-cover">
                {cover ? <Image src={cover.src} width={900} height={600}
                  sizes="(max-width: 599px) calc(100vw - 76px), (max-width: 899px) 43vw, (max-width: 1264px) 29vw, 350px"
                  alt={cover.alt || `${project.title}项目封面`} /> : <span className="home-cover-placeholder">{project.category}</span>}
              </div>
              <div className="home-project-content">
                <div className="home-project-title"><h3>{project.title}</h3><ArrowUpRight size={19} aria-hidden="true" /></div>
                <p>{project.description || project.subtitle}</p>
                <div className="home-project-tags">{project.tags.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}</div>
              </div>
            </Link>;
          })}
          {!latestProjects.length && <p className="home-empty">还没有已发布的项目。</p>}
        </div>
      </section>

      <section className="home-thoughts home-container" aria-labelledby="thoughts-title">
        <div><p className="home-eyebrow">NOT JUST ARTICLES</p><h2 id="thoughts-title">{home.noteTitle}</h2></div>
        <div className="home-thoughts-copy"><p>{home.noteText}</p><Link className="home-more" href="/notes">去说说看看 <ArrowRight size={17} aria-hidden="true" /></Link></div>
        <div className="home-thoughts-art" aria-hidden="true"><i /><i /><i /><span />
          {home.noteArtText.trim() && <p className="home-art-handwriting">{home.noteArtText}</p>}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
