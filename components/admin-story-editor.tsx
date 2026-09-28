'use client';

import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarDays } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { zhCN } from 'react-day-picker/locale';
import { format } from 'date-fns';
import { normalizeStoryTopics, type Story } from '@/lib/story-content';
import { api, upload } from './admin-fields';
import 'react-day-picker/style.css';

export function AdminStoryEditor({
  story, onChange, onWorking, pendingTopic, onPendingTopicChange, disabled = false,
}: {
  story: Story;
  onChange: (story: Story) => void;
  onWorking: (working: boolean) => void;
  pendingTopic: string;
  onPendingTopicChange: (topic: string) => void;
  disabled?: boolean;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [topicMessage, setTopicMessage] = useState('');
  const [imageMessage, setImageMessage] = useState('');
  const [workingImage, setWorkingImage] = useState<number | null>(null);
  const [year, month, day] = story.date.slice(0, 10).split('-').map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const time = story.date.slice(11, 19);

  function addTopic() {
    const topic = normalizeStoryTopics([pendingTopic])[0];
    if (!topic) { setTopicMessage('请输入话题内容'); return; }
    if (topic.length > 40) { setTopicMessage('每个话题最多 40 字'); return; }
    if (story.topics.includes(topic)) { setTopicMessage('话题不能重复'); return; }
    if (story.topics.length >= 6) { setTopicMessage('最多创建 6 个话题'); return; }
    onChange({ ...story, topics: [...story.topics, topic] });
    onPendingTopicChange('');
    setTopicMessage('');
  }

  function changeImage(index: number, image: Story['images'][number]) {
    onChange({ ...story, images: story.images.map((old, i) => i === index ? image : old) });
  }

  async function generateImage(index: number) {
    const image = story.images[index];
    if (disabled || workingImage !== null || !image.alt.trim()) return;
    setWorkingImage(index);
    onWorking(true);
    setImageMessage(`正在根据图片 ${index + 1} 的描述生成配图…`);
    try {
      const result = await api<{ url: string }>('/api/admin/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'story-image', description: image.alt }),
      });
      changeImage(index, { ...image, src: result.url });
      setImageMessage('图片已生成，点击“确认提交”后生效。');
    } catch (error) {
      setImageMessage(error instanceof Error ? error.message : '生成失败，原图片已保留。');
    } finally {
      setWorkingImage(null);
      onWorking(false);
    }
  }

  return <div className="admin-story-editor admin-fields">
    <div className="admin-field">
      <label htmlFor="story-date">日期（北京时间）</label>
      <Popover.Root open={calendarOpen && !disabled} onOpenChange={setCalendarOpen}>
        <Popover.Trigger id="story-date" className="admin-date-trigger" disabled={disabled}>
          {story.date.slice(0, 19).replace('T', ' ')}<CalendarDays size={17} />
        </Popover.Trigger>
        <Popover.Portal><Popover.Positioner sideOffset={6} align="start" className="admin-floating-positioner">
          <Popover.Popup className="admin-floating admin-calendar-popup">
            <Popover.Title className="admin-calendar-title">选择日期和时间</Popover.Title>
            <DayPicker mode="single" required selected={selectedDate} defaultMonth={selectedDate}
              locale={zhCN} captionLayout="dropdown" startMonth={new Date(2000, 0)}
              endMonth={new Date(new Date().getFullYear() + 10, 11)}
              onSelect={(date) => onChange({ ...story, date: `${format(date, 'yyyy-MM-dd')}T${time}+08:00` })} />
            <label className="admin-story-time" htmlFor="story-time">时间（时分秒）
              <input id="story-time" type="time" step="1" value={time}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next) onChange({ ...story, date: `${story.date.slice(0, 10)}T${next.length === 5 ? `${next}:00` : next}+08:00` });
                }} />
            </label>
            <button type="button" onClick={() => setCalendarOpen(false)}>完成</button>
          </Popover.Popup>
        </Popover.Positioner></Popover.Portal>
      </Popover.Root>
    </div>
    <div className="admin-field admin-wide">
      <label htmlFor="story-text">内容</label>
      <textarea id="story-text" rows={4} maxLength={5000} value={story.text}
        onChange={(event) => onChange({ ...story, text: event.target.value })} />
    </div>
    <div className="admin-field admin-wide">
      <label htmlFor="story-topics">话题</label>
      <div className="admin-story-topics">
        {story.topics.map((topic) => <span className="admin-story-topic" key={topic}>
          {topic}<button type="button" aria-label={`删除话题 ${topic}`}
            onClick={() => onChange({ ...story, topics: story.topics.filter((old) => old !== topic) })}>×</button>
        </span>)}
        <input id="story-topics" value={pendingTopic} placeholder="输入话题后按 Enter 创建"
          onChange={(event) => { onPendingTopicChange(event.target.value); setTopicMessage(''); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault(); addTopic();
            }
          }} />
      </div>
      <small>{story.topics.length} / 6 个话题，每个最多 40 字。</small>
      <output>{topicMessage}</output>
    </div>
    <fieldset className="admin-array">
      <legend>图片 <small>{story.images.length} 项</small></legend>
      {story.images.map((image, index) => <div className="admin-story-image" key={index}>
        <div className="admin-row-actions">
          <button type="button" disabled={index === 0} onClick={() => {
            const images = [...story.images];
            [images[index - 1], images[index]] = [images[index], images[index - 1]];
            onChange({ ...story, images });
          }}>上移</button>
          <button type="button" disabled={index === story.images.length - 1} onClick={() => {
            const images = [...story.images];
            [images[index], images[index + 1]] = [images[index + 1], images[index]];
            onChange({ ...story, images });
          }}>下移</button>
          <button type="button" onClick={() => {
            if (window.confirm('从当前表单中删除这张图片？点击“确认提交”后生效。'))
              onChange({ ...story, images: story.images.filter((_, i) => i !== index) });
          }}>删除</button>
        </div>
        <div className="admin-story-image-fields">
          <div className="admin-field">
            <label htmlFor={`story-image-${index}-src`}>素材地址</label>
            <input id={`story-image-${index}-src`} value={image.src}
              onChange={(event) => changeImage(index, { ...image, src: event.target.value })} />
          </div>
          <div className="admin-field">
            <label htmlFor={`story-image-${index}-alt`}>图片描述</label>
            <input id={`story-image-${index}-alt`} value={image.alt} maxLength={5000}
              onChange={(event) => changeImage(index, { ...image, alt: event.target.value })} />
          </div>
        </div>
        <div className="admin-asset">
          <label className="admin-file-button">上传替换
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onWorking(true); setWorkingImage(index); setImageMessage('正在上传…');
                try {
                  const result = await upload(file);
                  changeImage(index, { ...image, src: result.url });
                  setImageMessage('上传成功，点击“确认提交”后生效。');
                } catch (error) { setImageMessage(String(error)); }
                finally { onWorking(false); setWorkingImage(null); event.target.value = ''; }
              }} />
          </label>
          <button type="button" disabled={disabled || workingImage !== null || !image.alt.trim()}
            onClick={() => void generateImage(index)}>{workingImage === index ? '处理中…' : 'AI 生成配图'}</button>
          {/^(\/|https?:)/.test(image.src) && <a href={image.src} target="_blank" rel="noreferrer">查看素材 ↗</a>}
          <small>AI 生成配图依据当前图片描述生成</small>
        </div>
      </div>)}
      <button type="button" onClick={() => onChange({ ...story, images: [...story.images, { src: '', alt: '' }] })}>＋ 添加一项</button>
      <output className="admin-story-image-message">{imageMessage}</output>
    </fieldset>
    <label className="admin-check">
      <input type="checkbox" checked={story._published}
        onChange={(event) => onChange({ ...story, _published: event.target.checked })} />
      发布到前台<small>{story._published ? '保存后公开显示' : '草稿，仅后台可见'}</small>
    </label>
  </div>;
}
