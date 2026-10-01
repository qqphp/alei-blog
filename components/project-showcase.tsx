'use client';
import { contentPageSizes } from '@/lib/content-page-sizes';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ContentPagination,
  paginateItems,
} from '@/components/content-pagination';

import { useContent } from '@/components/content-provider';
import { newestProjectsFirst } from '@/lib/content-order';

import Image from 'next/image';
import { useState } from 'react';

import { PageIntro, SiteFooter, SiteHeader } from '@/components/site-chrome';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import '@/components/project-showcase.css';


export function ProjectShowcase({ initialId }: { initialId: string }) {
  const { projects: projectDocument } = useContent();
  const projects = newestProjectsFirst(projectDocument.items);
  const categories = [
    '全部',
    ...new Set(projects.map((project) => project.category)),
  ];
  const [category, setCategory] = useState('全部');
  const [selected, setSelected] = useState(initialId);
  const [page, setPage] = useState(() => {
    const initialIndex = projects.findIndex(
      (project) => project.id === initialId,
    );
    return Math.floor(Math.max(initialIndex, 0) / contentPageSizes.projects) + 1;
  });
  const [imageIndex, setImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const visible = projects.filter(
    (project) => category === '全部' || project.category === category,
  );
  const paginated = paginateItems(visible, page, contentPageSizes.projects);
  const active =
    visible.find((project) => project.id === selected) ?? visible[0];
  if (!active) return (
    <main className="site-shell">
      <SiteHeader />
      <PageIntro
        title="从一个想法，到一件作品。"
        text="收录产品原型、设计探索与个人工具，记录每个项目的构思、实现与迭代。"
      />
      <section className="folio-empty" aria-labelledby="project-empty-title">
        <div className="content-empty-state">
          <span className="content-empty-mark" aria-hidden="true">↗</span>
          <h2 id="project-empty-title">暂无已发布项目</h2>
          <p>作品还在酝酿中，之后会在这里记录构思、实现与迭代。</p>
          {projects.length > 0 && (
            <button type="button" onClick={() => setCategory('全部')}>查看全部项目</button>
          )}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
  const currentImage = active.images[imageIndex] ?? active.images[0];
  const previousImage = () =>
    setImageIndex(
      (index) => (index + active.images.length - 1) % active.images.length,
    );
  const nextImage = () =>
    setImageIndex((index) => (index + 1) % active.images.length);

  return (
    <main className="site-shell">
      <SiteHeader />
      <PageIntro
        title="从一个想法，到一件作品。"
        text="收录产品原型、设计探索与个人工具，记录每个项目的构思、实现与迭代。"
      />
      <section className="folio-toolbar" aria-label="项目分类筛选">
        <span className="folio-eyebrow">{"PROJECT INDEX /"}{String(projects.length).padStart(2, '0')}
        </span>
        <div>
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={category === item}
              onClick={() => {
                setCategory(item);
                const nextProjects = projects.filter(
                  (project) => item === '全部' || project.category === item,
                );
                setSelected(nextProjects[0]?.id ?? '');
                setImageIndex(0);
                setPage(1);
              }}
            >
              {item}
              <small>
                {item === '全部'
                  ? projects.length
                  : projects.filter((project) => project.category === item)
                      .length}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section className="folio-workspace">
        <aside className="folio-sidebar">
          <div className="folio-section-label">
            <span>{"浏览项目"}</span>
            <span>{String(visible.length).padStart(2, '0')}{"ENTRIES"}</span>
          </div>
          <div className="folio-project-list">
            {paginated.items.map((project) => (
              <button
                type="button"
                className="folio-project"
                aria-pressed={active.id === project.id}
                onClick={() => {
                  setSelected(project.id);
                  setImageIndex(0);
                }}
                key={project.id}
              >
                <div className="folio-project-cover">
                  <Image
                    src={project.images[0].src}
                    width={420}
                    height={230}
                    alt=""
                  />
                  <span>
                    {project.category}
                  </span>
                </div>
                <div className="folio-project-copy">
                  <h2>
                    {project.title}
                    <span aria-hidden="true">↗</span>
                  </h2>
                  <p>{project.subtitle}</p>
                  <small>
                    <i />
                    {project.status}
                  </small>
                </div>
              </button>
            ))}
          </div>
          <ContentPagination
            ariaLabel="项目分页"
            itemCount={visible.length}
            itemLabel="个项目"
            page={paginated.currentPage}
            pageSize={contentPageSizes.projects}
            onPageChange={(nextPage) => {
              const next = paginateItems(visible, nextPage, contentPageSizes.projects);
              setPage(next.currentPage);
              setSelected(next.items[0]?.id ?? '');
              setImageIndex(0);
            }}
          />
          <div className="folio-note">
            <span className="folio-eyebrow">{"ABOUT THIS INDEX"}</span>
            <h3>{"不只陈列结果，"}<br />{"也留下思考。"}</h3>
          </div>
        </aside>
        <article className="folio-detail">
          <header className="folio-detail-header">
            <div className="folio-section-label">
              <span>项目档案</span>
              <span>{active.year}</span>
            </div>
            <div className="folio-title">
              <h2>{active.title}</h2>
              <span>{active.status}</span>
            </div>
            <p>{active.description}</p>
            <div className="folio-tags">
              {active.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </header>
          <div className="folio-gallery">
            <button
              type="button"
              className="folio-expand"
              onClick={() => setExpanded(true)}
              aria-label={`放大查看${currentImage.label}`}
            >
              <Image
                src={currentImage.src}
                width={1100}
                height={660}
                alt={currentImage.alt}
                priority
              />
              <span>{"↗ 放大查看"}</span>
            </button>
            <div className="folio-gallery-bar">
              <span>
                {String(imageIndex + 1).padStart(2, '0')} /{' '}
                {String(active.images.length).padStart(2, '0')}
                <b>{currentImage.label}</b>
              </span>
              <div>
                <button
                  type="button"
                  onClick={previousImage}
                  aria-label="查看上一张项目图片"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  aria-label="查看下一张项目图片"
                >
                  →
                </button>
              </div>
            </div>
          </div>
          <div className="folio-thumbnails">
            {active.images.map((image, index) => (
              <button
                type="button"
                key={image.src}
                aria-pressed={index === imageIndex}
                aria-label={`查看${image.label}`}
                onClick={() => setImageIndex(index)}
              >
                <Image src={image.src} width={112} height={70} alt="" />
                <span>
                  <small>0{index + 1}</small>
                  {image.label}
                </span>
              </button>
            ))}
          </div>
          <dl className="folio-facts">
            <div>
              <dt>{"项目分类"}</dt>
              <dd>{active.category}</dd>
            </div>
            <div>
              <dt>{"项目网址"}</dt>
              <dd>
                {active.url ? (
                  <a
                    className="folio-project-url"
                    href={active.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {active.url}
                  </a>
                ) : (
                  <span className="folio-project-url-empty">暂未提供</span>
                )}
              </dd>
            </div>
          </dl>
          {active.body && <section className="folio-markdown"><h3>项目说明</h3><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{active.body}</ReactMarkdown></section>}
        </article>
      </section>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="image-dialog"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              previousImage();
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              nextImage();
            }
          }}
        >
          <DialogTitle>
            {active.title} · {currentImage.label}
          </DialogTitle>
          <div className="dialog-gallery">
            <button
              className="dialog-gallery-control previous"
              type="button"
              onClick={previousImage}
              aria-label="查看上一张项目图片"
            >
              ←
            </button>
            <Image
              src={currentImage.src}
              width={1200}
              height={900}
              alt={currentImage.alt}
            />
            <button
              className="dialog-gallery-control next"
              type="button"
              onClick={nextImage}
              aria-label="查看下一张项目图片"
            >
              →
            </button>
            <span>
              {String(imageIndex + 1).padStart(2, '0')} /{' '}
              {String(active.images.length).padStart(2, '0')}
            </span>
          </div>
        </DialogContent>
      </Dialog>
      <SiteFooter />
    </main>
  );
}
