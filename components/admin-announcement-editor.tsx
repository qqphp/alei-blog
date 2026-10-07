'use client';

import { type Announcement, announcementTime, shanghaiInput } from '@/lib/announcements';
import { formatRecordTime } from '@/lib/content-times';
import { AdminMarkdownEditor } from './admin-markdown-editor';

export function AdminAnnouncementEditor({ value, categories, onChange, onWorking }: {
  value: Announcement; categories: { id: string; name: string }[];
  onChange: (value: Announcement) => void; onWorking: (working: boolean) => void;
}) {
  return <div className="admin-fields">
    <div className="admin-field"><label htmlFor="announcement-title">标题</label>
      <input id="announcement-title" required value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></div>
    <div className="admin-field"><label htmlFor="announcement-category">公告类型</label>
      <select id="announcement-category" required value={value.categoryId} onChange={(event) => onChange({ ...value, categoryId: event.target.value })}>
        <option value="">请选择公告类型</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>{!categories.length && <small>请先在“分类”页签新增公告类型。</small>}</div>
    <div className="admin-field"><label htmlFor="announcement-start">开始时间（北京时间）</label>
      <input id="announcement-start" type="datetime-local" step="1" required value={shanghaiInput(value.startAt)}
        onChange={(event) => onChange({ ...value, startAt: announcementTime(event.target.value) })} /></div>
    <div className="admin-field"><label htmlFor="announcement-end">结束时间（北京时间）</label>
      <input id="announcement-end" type="datetime-local" step="1" value={shanghaiInput(value.endAt)}
        onChange={(event) => onChange({ ...value, endAt: announcementTime(event.target.value) })} />
      <small>留空表示长期有效；到达结束时间后停止展示。</small></div>
    <AdminMarkdownEditor label="公告内容" value={value.body} onWorking={onWorking}
      onChange={(body) => onChange({ ...value, body })} />
    <label className="admin-check"><input type="checkbox" checked={value._published}
      onChange={(event) => onChange({ ...value, _published: event.target.checked })} />发布到前台
      <small>{value._published ? '保存后在有效期内展示' : '草稿，仅后台可见'}</small></label>
    {value.createdAt && <div className="admin-announcement-times admin-wide">
      <span>创建时间：{formatRecordTime(value.createdAt)}</span><span>编辑时间：{formatRecordTime(value.updatedAt)}</span>
    </div>}
  </div>;
}
