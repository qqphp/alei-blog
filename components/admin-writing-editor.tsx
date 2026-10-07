'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminMarkdownEditor } from './admin-markdown-editor';
import type { Content } from '@/lib/cms-defaults';
import { categoryRows } from '@/lib/article-categories';
import { api, upload } from './admin-fields';
import { articleDescription, brandedTitle } from '@/lib/seo-text';

export type Article = Content['writing'][number];

export function AdminWritingEditor({
  article,
  categories,
  onChange,
  onWorking,
  disabled = false,
  siteName = '',
  siteUrl = '',
}: {
  article: Article;
  categories: Content['categories'];
  onChange: (article: Article) => void;
  onWorking: (working: boolean) => void;
  disabled?: boolean;
  siteName?: string;
  siteUrl?: string;
}) {
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const currentArticle = useRef(article);
  useEffect(() => { currentArticle.current = article; }, [article]);
  const set = <K extends keyof Article>(key: K, value: Article[K]) =>
    onChange({ ...article, [key]: value });
  async function generate() {
    if (working || disabled || !article.coverDescription.trim()) return;
    setWorking(true);
    onWorking(true);
    setMessage('正在根据图片描述生成配图…');
    try {
      const result = await api<{ url: string; generatedFor: string }>('/api/admin/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cover', description: article.coverDescription }),
      });
      onChange({ ...currentArticle.current, cover: result.url, coverMode: 'ai', coverGeneratedFor: result.generatedFor });
      setMessage('图片已生成，点击“确认提交”后生效。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '生成失败，原封面已保留。');
    } finally {
      setWorking(false);
      onWorking(false);
    }
  }
  return (
    <div className="admin-writing-editor">
      <div className="admin-fields">
        <div className="admin-writing-title-row admin-story-image-fields admin-wide">
          <div className="admin-field">
            <label htmlFor="article-title">文章标题</label>
            <input id="article-title" value={article.title}
              onChange={(e) => set('title', e.target.value)} maxLength={500} />
          </div>
          <div className="admin-field">
            <label htmlFor="article-category">文章分类</label>
            <select id="article-category" value={article.categoryId}
              onChange={(e) => onChange({
                ...article, categoryId: e.target.value,
                category: categories.find((category) => category.id === e.target.value)?.name ?? '',
              })}>
              <option value="" disabled>请选择分类</option>
              {categoryRows(categories).map(({ category, path }) => (
                <option key={category.id} value={category.id}>{path}</option>
              ))}
            </select>
            {!categories.length && <small>请先在左侧「文章分类」中新增分类。</small>}
          </div>
        </div>
        <div className="admin-field admin-wide">
          <label htmlFor="article-excerpt">文章摘要</label>
          <textarea id="article-excerpt" rows={4} value={article.excerpt}
            onChange={(e) => set('excerpt', e.target.value)} maxLength={5000} />
        </div>
        <fieldset className="admin-cover admin-wide" disabled={working || disabled}>
          <legend>文章封面</legend>
          <div className="admin-story-image-fields">
            <div className="admin-field">
              <label htmlFor="article-cover">素材地址</label>
              <input id="article-cover" value={article.cover}
                onChange={(event) => onChange({ ...article, cover: event.target.value,
                  coverMode: 'upload', coverGeneratedFor: '' })} />
            </div>
            <div className="admin-field">
              <label htmlFor="article-cover-description">图片描述</label>
              <input id="article-cover-description" value={article.coverDescription}
                maxLength={5000} onChange={(event) => set('coverDescription', event.target.value)} />
            </div>
          </div>
          <div className="admin-asset">
            <label className="admin-file-button">上传替换
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={working || disabled}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file || working || disabled) return;
                  const input = event.currentTarget;
                  setWorking(true);
                  onWorking(true);
                  setMessage('正在上传…');
                  try {
                    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
                    const result = await upload(file);
                    onChange({ ...currentArticle.current, cover: result.url, coverMode: 'upload', coverGeneratedFor: '' });
                    setMessage('已上传，点击“确认提交”后生效。');
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : '上传失败，原封面已保留。');
                  } finally {
                    setWorking(false);
                    onWorking(false);
                    input.value = '';
                  }
                }} />
            </label>
            <button type="button" disabled={working || disabled || !article.coverDescription.trim()}
              onClick={() => void generate()}>{working ? '处理中…' : 'AI 生成配图'}</button>
            {/^(\/|https?:)/.test(article.cover) &&
              <a href={article.cover} target="_blank" rel="noreferrer">查看素材 ↗</a>}
            <small>AI 生成配图依据当前图片描述生成</small>
            <output>{message}</output>
          </div>
        </fieldset>
        <AdminMarkdownEditor label="文章正文" value={article.body}
          onWorking={onWorking} onChange={(body) => set('body', body)} />
        <details className="admin-wide admin-seo-editor">
          <summary>搜索展示（可选）</summary>
          <div className="admin-field">
            <label htmlFor="article-seo-title">SEO 标题</label>
            <input id="article-seo-title" value={article.seoTitle ?? ''} maxLength={200}
              placeholder="留空使用文章标题" onChange={(event) => set('seoTitle', event.target.value)} />
          </div>
          <div className="admin-field">
            <label htmlFor="article-seo-description">SEO 描述</label>
            <textarea id="article-seo-description" rows={3} value={article.seoDescription ?? ''} maxLength={1000}
              placeholder="留空使用摘要或正文简介" onChange={(event) => set('seoDescription', event.target.value)} />
          </div>
          <small>输入上限用于保护数据，不代表搜索引擎展示长度或排名。</small>
          <div className="admin-seo-preview" aria-label="搜索展示预览">
            <strong>{siteName ? brandedTitle(article.seoTitle?.trim() ? article.seoTitle : article.title, siteName) : article.seoTitle || article.title}</strong>
            <p>{siteUrl || '正式域名尚未配置'}/writing/{article.slug}</p>
            <p>{articleDescription(article)}</p>
            <small>预览仅供参考，搜索引擎可能采用不同的标题和摘要。</small>
          </div>
        </details>
        <label className="admin-check">
          <input type="checkbox" checked={article._published} disabled={disabled}
            onChange={(event) => set('_published', event.target.checked)} />
          发布到前台
          <small>{article._published ? '保存后公开显示' : '草稿，仅后台可见'}</small>
        </label>
      </div>
    </div>
  );
}
