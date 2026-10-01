'use client';
import { useState } from 'react';
import type { Json } from '@/lib/cms-validation';
import type { Content, Section } from '@/lib/cms-defaults';
import type { ProjectImage } from '@/lib/project-content';
import { AdminMarkdownEditor } from './admin-markdown-editor';

type ApiData = {
  error?: string;
  content: Content;
  revisions: Partial<Record<Section, number>>;
  revision: number;
  authenticated: boolean;
  configured: boolean;
  url: string;
  name: string;
};

const names: Record<string, string> = {
  title: '标题',
  name: '名称',
  description: '说明',
  excerpt: '摘要',
  body: '正文（Markdown）',
  date: '日期',
  label: '标签 / 栏目',
  meta: '阅读时长',
  tag: '标签',
  category: '分类',
  categoryId: '分类',
  statusId: '状态',
  moodId: '场景',
  sectionId: '栏目',
  parentId: '上级分类',
  coverMode: '封面来源',
  mode: '图片来源',
  createdAt: '创建时间',
  creator: '作者', logo: 'Logo', subcategory: '子分类',
  audio: '音频地址',
  cover: '封面地址',
  slug: '文章路径标识',
  id: '唯一标识',
  text: '文字',
  topic: '话题',
  topics: '话题',
  images: '图片',
  src: '素材地址',
  alt: '图片描述',
  _published: '发布到前台',
  status: '内容状态',
  subtitle: '副标题',
  number: '编号',
  year: '年份',
  role: '项目网址',
  tags: '标签',
  question: '起点问题',
  decisions: '设计选择',
  steps: '过程步骤',
  next: '下一步',
  wechat: '微信号',
  email: '邮箱',
  publicAccountQr: '公众号二维码',
  serviceUrl: '服务网址',
  platforms: '平台入口',
  url: '网址',
  initials: '头像文字',
  author: '作者',
  songs: '歌曲',
  album: '相册',
  note: '笔记',
  artist: '音乐作者',
  duration: '时长（秒）',
  mood: '场景',
  intro: '简介',
  entries: '内容条目',
  sections: '主题分组',
  kind: '类型',
  summary: '摘要',
  paragraphs: '正文段落',
  href: '链接地址',
  link: '链接文字',
  width: '宽度',
  height: '高度',
  position: '图片取景位置',
  mark: '站点标记',
  footer: '页脚文字',
  copyright: '版权文字',
  footerLink: '页脚链接文字',
  footerUrl: '页脚链接地址',
  links: '主导航',
  sites: '网站导航',
  life: '生活导航',
  eyebrow: '眉题',
  noteTitle: '说说区标题',
  noteText: '说说区说明',
  director: '导演',
  genre: '类型',
  country: '国家',
  language: '语言',
  host: '专辑主播',
};
const describedCoverActions: Record<string, string> = {
  'tracks.playlists': 'playlist-cover',
  'films.items': 'film-cover',
  'podcasts.items': 'podcast-cover',
  'travel.items': 'travel-cover',
  'hobbies.items': 'hobby-cover',
  'books.items': 'book-cover',
  'books.lists': 'booklist-cover',
};
const orderedRecordPaths = new Set([
  'projects.items', 'tracks.items', 'tracks.playlists', 'films.items',
  'podcasts.items', 'books.items', 'travel.items', 'hobbies.items',
]);
export const asJson = (value: unknown) => value as Json;
export function titleOf(value: Json, index: number) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const title = [value.title, value.name, value.topic, value.label].find(
      (item) => typeof item === 'string' && item,
    );
    return typeof title === 'string' ? title : `条目 ${index + 1}`;
  }
  return typeof value === 'string'
    ? value.slice(0, 40) || `条目 ${index + 1}`
    : `条目 ${index + 1}`;
}
export function fresh(sample: Json): Json {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === 'object')
    return Object.fromEntries(
      Object.entries(sample).map(([key, value]) => [
        key,
        key === '_published'
          ? false
          : key === 'coverMode' || key === 'mode'
            ? 'upload'
          : key === 'id' || key === 'slug'
            ? `new-${crypto.randomUUID().slice(0, 8)}`
            : key === 'title' || key === 'name'
              ? '未命名内容'
              : Array.isArray(value)
                ? key === 'images'
                  ? structuredClone(value)
                  : []
                : value && typeof value === 'object'
                  ? fresh(value)
                  : ['color', 'src', 'cover', 'image', 'date'].includes(key)
                    ? value
                    : typeof value === 'string'
                      ? ''
                      : value,
      ]),
    );
  return typeof sample === 'string' ? '' : structuredClone(sample);
}
export async function api<T = ApiData>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, { ...options, cache: 'no-store' });
  const data = (await response.json()) as ApiData;
  if (!response.ok) throw new Error(data.error || '请求失败，请重试');
  return data as unknown as T;
}

async function compressImage(file: File) {
  if (
    !file.type.startsWith('image/') ||
    typeof createImageBitmap !== 'function'
  )
    return file;
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 2400;
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理图片，请更换浏览器后重试');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('图片压缩失败')),
        'image/webp',
        0.82,
      );
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close?.();
  }
}
async function imageDimensions(file: File) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try { return { width: bitmap.width, height: bitmap.height }; }
    finally { bitmap.close?.(); }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('无法读取图片尺寸，请更换图片后重试'));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
async function audioDuration(file: File) {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('读取音频时长超时，请更换文件后重试')), 15000);
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error('无法读取音频时长，请更换文件后重试'));
      audio.preload = 'metadata';
      audio.src = url;
      audio.load();
    });
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('无法读取音频时长，请更换文件后重试');
    return Math.ceil(duration);
  } finally {
    clearTimeout(timeout);
    audio.onloadedmetadata = null;
    audio.onerror = null;
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(url);
  }
}

export async function upload(file: File, includeSize: true): Promise<{ url: string; name: string; width: number; height: number }>;
export async function upload(file: File, includeSize?: false): Promise<{ url: string; name: string }>;
export async function upload(file: File, includeSize = false) {
  if (file.size > 20 * 1024 * 1024) throw new Error('文件不能超过 20 MB');
  file = await compressImage(file);
  const dimensions = includeSize ? await imageDimensions(file) : null;
  const result = await api<{ url: string; name: string }>('/api/admin/media', {
    method: 'POST',
    headers: { 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
  return dimensions ? { ...result, ...dimensions } : result;
}
function TagsField({ path, value, onChange, pending, onPendingChange }: {
  path: string;
  value: string[]; onChange: (value: Json) => void;
  pending: string; onPendingChange: (value: string) => void;
}) {
  const [message, setMessage] = useState('');
  const inputId = path === 'projects.items.tags' ? 'project-tags' : `${path}-tags`;
  function add() {
    const tag = pending.trim();
    if (!tag) { setMessage('请输入标签内容'); return; }
    if (value.includes(tag)) { setMessage('标签不能重复'); return; }
    if (path === 'projects.items.tags' && value.length >= 500) { setMessage('标签最多 500 项'); return; }
    onChange([...value, tag]);
    onPendingChange('');
    setMessage('');
  }
  return <div className="admin-field admin-wide">
    <label htmlFor={inputId}>标签</label>
    <div className="admin-story-topics">
      {value.map((tag) => <span className="admin-story-topic" key={tag}>{tag}
        <button type="button" aria-label={`删除标签 ${tag}`}
          onClick={() => onChange(value.filter((old) => old !== tag))}>×</button>
      </span>)}
      <input id={inputId} value={pending} placeholder="输入标签后按 Enter 创建"
        onChange={(event) => { onPendingChange(event.target.value); setMessage(''); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault(); add();
          }
        }} />
    </div>
    <output>{message}</output>
  </div>;
}

function ProjectImagesField({ value, onChange, onWorking }: {
  value: ProjectImage[]; onChange: (value: Json) => void;
  onWorking?: (working: boolean) => void;
}) {
  const [workingIndex, setWorkingIndex] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const change = (index: number, image: ProjectImage) =>
    onChange(value.map((old, i) => i === index ? image : old));
  const move = (index: number, direction: number) => {
    const images = [...value];
    [images[index], images[index + direction]] = [images[index + direction], images[index]];
    onChange(images);
  };
  async function generate(index: number) {
    const image = value[index];
    if (workingIndex !== null || !image.alt.trim()) return;
    setWorkingIndex(index); onWorking?.(true); setMessage('正在根据图片描述生成配图…');
    try {
      const result = await api<{ url: string; generatedFor: string }>('/api/admin/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'project-cover', description: image.alt }),
      });
      change(index, { ...image, src: result.url, mode: 'ai', generatedFor: result.generatedFor });
      setMessage('图片已生成，点击“确认提交”后生效。');
    } catch (error) { setMessage(String(error)); }
    finally { setWorkingIndex(null); onWorking?.(false); }
  }
  return <fieldset className="admin-array">
    <legend>图片 <small>{value.length} 项</small></legend>
    {value.map((image, index) => <div className="admin-story-image" key={index}>
      <div className="admin-row-actions">
        <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>上移</button>
        <button type="button" disabled={index === value.length - 1} onClick={() => move(index, 1)}>下移</button>
        <button type="button" onClick={() => {
          if (window.confirm('从当前表单中删除这张图片？点击“确认提交”后生效。'))
            onChange(value.filter((_, i) => i !== index));
        }}>删除</button>
      </div>
      <div className="admin-story-image-fields">
        <div className="admin-field"><label htmlFor={`project-image-${index}-src`}>素材地址</label>
          <input id={`project-image-${index}-src`} value={image.src}
            onChange={(event) => change(index, { ...image, src: event.target.value, mode: 'upload', generatedFor: '' })} /></div>
        <div className="admin-field"><label htmlFor={`project-image-${index}-alt`}>图片描述</label>
          <input id={`project-image-${index}-alt`} value={image.alt} maxLength={5000}
            onChange={(event) => change(index, { ...image, alt: event.target.value })} /></div>
      </div>
      <div className="admin-field admin-project-image-label"><label htmlFor={`project-image-${index}-label`}>图片标题</label>
        <input id={`project-image-${index}-label`} value={image.label}
          onChange={(event) => change(index, { ...image, label: event.target.value })} /></div>
      <div className="admin-asset">
        <label className="admin-file-button">上传替换<input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            setWorkingIndex(index); onWorking?.(true); setMessage('上传中…');
            try {
              const result = await upload(file);
              change(index, { ...image, src: result.url, mode: 'upload', generatedFor: '' });
              setMessage('已上传，点击“确认提交”后生效。');
            } catch (error) { setMessage(String(error)); }
            finally { setWorkingIndex(null); onWorking?.(false); event.target.value = ''; }
          }} /></label>
        <button type="button" disabled={workingIndex !== null || !image.alt.trim()}
          onClick={() => void generate(index)}>AI 生成配图</button>
        {/^(\/|https?:)/.test(image.src) && <a href={image.src} target="_blank" rel="noreferrer">查看素材 ↗</a>}
        <small>AI 生成配图依据当前图片描述生成</small>
      </div>
    </div>)}
    <button type="button" onClick={() => onChange([...value,
      { src: '', alt: '', label: '', mode: 'upload', generatedFor: '' }])}>＋ 添加一项</button>
    <output className="admin-story-image-message">{message}</output>
  </fieldset>;
}

function DescriptionImageField({ path, value, onChange, onWorking }: {
  path: string; value: Record<string, Json>; onChange: (value: Json) => void;
  onWorking?: (working: boolean) => void;
}) {
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const cover = typeof value.cover === 'string' ? value.cover : '';
  const description = typeof value.coverDescription === 'string' ? value.coverDescription : '';
  async function generate() {
    if (working || !description.trim()) return;
    setWorking(true); onWorking?.(true); setMessage('正在根据图片描述生成配图…');
    try {
      const result = await api<{ url: string; generatedFor: string }>('/api/admin/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: describedCoverActions[path], description }),
      });
      onChange({ ...value, cover: result.url,
        ...('coverMode' in value ? { coverMode: 'ai' } : {}),
        ...('coverGeneratedFor' in value ? { coverGeneratedFor: result.generatedFor } : {}) });
      setMessage('图片已生成，点击“确认提交”后生效。');
    } catch (error) { setMessage(String(error)); }
    finally { setWorking(false); onWorking?.(false); }
  }
  return <div className="admin-description-image">
    <div className="admin-story-image-fields">
      <div className="admin-field"><label htmlFor={`${path}.cover`}>封面图</label>
        <input id={`${path}.cover`} value={cover} onChange={(event) => onChange({ ...value,
          cover: event.target.value,
          ...('coverMode' in value ? { coverMode: 'upload' } : {}),
          ...('coverGeneratedFor' in value ? { coverGeneratedFor: '' } : {}) })} /></div>
      <div className="admin-field"><label htmlFor={`${path}.coverDescription`}>图片描述</label>
        <input id={`${path}.coverDescription`} value={description} maxLength={5000}
          onChange={(event) => onChange({ ...value, coverDescription: event.target.value })} /></div>
    </div>
    <div className="admin-asset">
      <label className="admin-file-button">上传替换<input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={async (event) => {
          const file = event.target.files?.[0]; if (!file) return;
          setWorking(true); onWorking?.(true); setMessage('上传中…');
          try {
            const result = await upload(file);
            onChange({ ...value, cover: result.url,
              ...('coverMode' in value ? { coverMode: 'upload' } : {}),
              ...('coverGeneratedFor' in value ? { coverGeneratedFor: '' } : {}) });
            setMessage('已上传，点击“确认提交”后生效。');
          } catch (error) { setMessage(String(error)); }
          finally { setWorking(false); onWorking?.(false); event.target.value = ''; }
        }} /></label>
      <button type="button" disabled={working || !description.trim()} onClick={() => void generate()}>AI 生成配图</button>
      {/^(\/|https?:)/.test(cover) && <a href={cover} target="_blank" rel="noreferrer">查看素材 ↗</a>}
      <small>AI 生成配图依据当前图片描述生成</small>
      <output>{message}</output>
    </div>
  </div>;
}
export function Field({
  value,
  sample,
  onChange,
  label,
  path,
  options = {},
  immutableIdentity = false,
  onWorking,
  onUploaded,
  onAudioUploaded,
  pendingTag = '',
  onPendingTagChange,
}: {
  value: Json;
  sample: Json;
  onChange: (value: Json) => void;
  label: string;
  path: string;
  options?: Record<string, { id: string; name: string }[]>;
  immutableIdentity?: boolean;
  onWorking?: (working: boolean) => void;
  onUploaded?: (result: { url: string; width: number; height: number }) => void;
  onAudioUploaded?: (result: { url: string; duration: number }) => void;
  pendingTag?: string;
  onPendingTagChange?: (value: string) => void;
}) {
  const [message, setMessage] = useState('');
  if (['projects.items.tags', 'bookmarks.items.tags', 'friends.items.tags'].includes(path) && Array.isArray(value))
    return <TagsField path={path} value={value as string[]} onChange={onChange}
      pending={pendingTag} onPendingChange={onPendingTagChange ?? (() => {})} />;
  if (path === 'projects.items.images' && Array.isArray(value))
    return <ProjectImagesField value={value as unknown as ProjectImage[]}
      onChange={onChange} onWorking={onWorking} />;
  if (Array.isArray(value)) {
    const template = Array.isArray(sample) ? (sample[0] ?? '') : '';
    const move = (index: number, direction: number) => {
      const items = [...value];
      [items[index], items[index + direction]] = [
        items[index + direction],
        items[index],
      ];
      onChange(items);
    };
    return (
      <fieldset className="admin-array">
        <legend>
          {label} <small>{value.length} 项</small>
        </legend>
        {value.map((item, index) => (
          <details key={index} className="admin-nested">
            <summary>{titleOf(item, index)}</summary>
            <div className="admin-row-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                上移
              </button>
              <button
                type="button"
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                下移
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('从当前表单中删除这项内容？点击“确认提交”后生效。'))
                    onChange(value.filter((_, i) => i !== index));
                }}
              >
                删除
              </button>
            </div>
            <Field
              path={`${path}.${index}`}
              label={`第 ${index + 1} 项`}
              sample={template}
              value={item}
              onChange={(next) =>
                onChange(value.map((old, i) => (i === index ? next : old)))
              }
              options={options}
              immutableIdentity={immutableIdentity}
              onWorking={onWorking}
              pendingTag={pendingTag}
              onPendingTagChange={onPendingTagChange}
            />
          </details>
        ))}
        <button
          type="button"
          onClick={() => onChange([...value, fresh(template)])}
        >
          ＋ 添加一项
        </button>
      </fieldset>
    );
  }
  if (value && typeof value === 'object') {
    const template =
      sample && typeof sample === 'object' && !Array.isArray(sample)
        ? sample
        : {};
    const keys = path === 'slides.root' ? ['title', 'src', 'alt', ...Object.keys(value)]
      : path === 'writing.categories' ? ['name', 'parentId', 'description']
        : path === 'bookmarks.items' || path === 'friends.items'
          ? ['name', 'url', 'description', 'initials', 'categoryId', 'tags', '_published', ...Object.keys(value)]
        : orderedRecordPaths.has(path) ? Object.keys(template) : Object.keys(value);
    return (
      <div className={`admin-object${path === 'slides.root' ? ' admin-slide-cover' : ''}${path === 'writing.categories' ? ' admin-article-category' : ''}${path === 'ai.agents' ? ' admin-agent-resource' : ''}`}>
        <h3>{label}</h3>
        <div className="admin-fields">
          {[...new Set(keys)].filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]] as const).filter(([key]) =>
            !['id', 'coverGeneratedFor', 'generatedFor', 'createdAt', 'updatedAt'].includes(key) &&
            !(describedCoverActions[path] && ['coverDescription', 'coverMode'].includes(key)) &&
            !(key === 'category' && Object.hasOwn(value, 'categoryId')) &&
            !(key === 'status' && Object.hasOwn(value, 'statusId')) &&
            !(key === 'mood' && Object.hasOwn(value, 'moodId')),
          ).map(([key, item]) => key === 'cover' && describedCoverActions[path]
            ? <DescriptionImageField key={key} path={path} value={value}
                onChange={onChange} onWorking={onWorking} /> : (
            <Field
              key={key}
              path={`${path}.${key}`}
              label={names[key] || key}
              sample={template[key] ?? item}
              value={item}
              onChange={(next) => onChange({ ...value, [key]: next })}
              options={options}
              immutableIdentity={immutableIdentity}
              onWorking={onWorking}
              onUploaded={path === 'slides.root' && key === 'src' && !immutableIdentity
                ? ({ url, width, height }) => onChange({ ...value, src: url, width, height, position: 'center 55%' })
                : undefined}
              onAudioUploaded={path === 'tracks.items' && key === 'src'
                ? ({ url, duration }) => onChange({ ...value, src: url, duration })
                : undefined}
              pendingTag={pendingTag}
              onPendingTagChange={onPendingTagChange}
            />
          ))}
        </div>
      </div>
    );
  }
  if (typeof value === 'boolean')
    return (
      <label className="admin-check">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
        <small>{value ? '保存后公开显示' : '草稿，仅后台可见'}</small>
      </label>
    );
  const field = path.split('.').at(-1)!;
  const blankNumeric = path === 'slides.root.width' || path === 'slides.root.height' || path === 'tracks.items.duration';
  const numeric = typeof value === 'number' || (blankNumeric && value === null);
  if (path === 'projects.items.body' || path === 'travel.items.body' || path === 'hobbies.items.body')
    return (
      <AdminMarkdownEditor
        label={path === 'projects.items.body' ? '项目正文' : '正文'}
        value={String(value ?? '')}
        onWorking={onWorking}
        onChange={onChange}
      />
    );
  const asset = /^(src|cover|image|audio|publicAccountQr|logo)$/.test(field) || /\.album\.\d+$/.test(path);
  const long =
    typeof value === 'string' &&
    ((typeof sample === 'string' &&
      (sample.length > 90 || sample.includes('\n'))) ||
      /body|description|excerpt|text|note|summary|paragraph/.test(field));
  return (
    <div className={`admin-field${path === 'ai.agents.logo' || path === 'ai.relays.logo' ? ' admin-resource-logo' : ''}${path === 'tracks.items.src' ? ' admin-track-src' : ''}`}>
      <label htmlFor={path}>{label}</label>
      {options[field] ? (
        <select id={path} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">请选择</option>
          {options[field].map((option) =>
            <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      ) : long ? (
        <textarea
          id={path}
          rows={field === 'body' ? 18 : 4}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={path}
          type={numeric ? 'number' : 'text'}
          disabled={immutableIdentity && field === 'id'}
          value={String(value ?? '')}
          onChange={(e) =>
            onChange(
              numeric
                ? blankNumeric && e.target.value === '' ? null : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
      {field === 'slug' && (
        <small>
          例如 first-post；文章地址为
          /writing/first-post。修改后旧地址不再有效。
        </small>
      )}
      {asset && (
        <div className="admin-asset">
          <label className="admin-file-button">
            上传替换
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/wav"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setMessage('上传中…');
                onWorking?.(true);
                try {
                  if (onAudioUploaded) {
                    const duration = await audioDuration(file);
                    onAudioUploaded({ ...(await upload(file)), duration });
                  } else if (onUploaded) onUploaded(await upload(file, true));
                  else onChange((await upload(file)).url);
                  setMessage('已上传，点击表单底部“确认提交”后生效。');
                } catch (error) {
                  setMessage(String(error));
                } finally {
                  onWorking?.(false);
                  e.target.value = '';
                }
              }}
            />
          </label>
          {typeof value === 'string' && /^(\/|https?:)/.test(value) && (
            <a href={value} target="_blank" rel="noreferrer">
              查看素材 ↗
            </a>
          )}
          <output>{message}</output>
        </div>
      )}
    </div>
  );
}
