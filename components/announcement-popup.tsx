'use client';

import { useEffect, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { announcementReadKey, type PublicAnnouncement } from '@/lib/announcements';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { MarkdownContent } from './markdown-content';
import './announcement-popup.css';

function readMarkers(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(announcementReadKey) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, version]) => typeof version === 'string')) : {};
  } catch { return {}; }
}

export function AnnouncementPopup({ announcements }: { announcements: PublicAnnouncement[] }) {
  const [items, setItems] = useState<PublicAnnouncement[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const current = items[index];
  useEffect(() => {
    const task = setTimeout(() => {
      const read = readMarkers();
      const unread = announcements.filter((item) => read[item.id] !== item.updatedAt);
      setItems(unread); setIndex(0); setOpen(unread.length > 0);
    }, 0);
    return () => clearTimeout(task);
  }, [announcements]);
  useEffect(() => {
    if (!open || !current) return;
    try { localStorage.setItem(announcementReadKey, JSON.stringify({ ...readMarkers(), [current.id]: current.updatedAt })); }
    catch { /* Browsers that block storage still allow reading and closing this visit. */ }
  }, [open, current]);
  if (!current) return null;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="announcement-popup" showCloseButton={false}>
      <DialogClose className="announcement-close" aria-label="关闭公告"><X size={20} /></DialogClose>
      <DialogDescription className="announcement-eyebrow"><Bell size={16} aria-hidden="true" />网站公告 · {current.category}</DialogDescription>
      <DialogTitle className="announcement-title">{current.title}</DialogTitle>
      <div className="announcement-body"><MarkdownContent source={current.body} /></div>
      <div className="announcement-controls">
        <button type="button" aria-label="上一条公告" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={17} />上一条</button>
        <span aria-live="polite">{index + 1} / {items.length}</span>
        <button type="button" aria-label="下一条公告" disabled={index === items.length - 1} onClick={() => setIndex(index + 1)}>下一条<ChevronRight size={17} /></button>
      </div>
    </DialogContent>
  </Dialog>;
}
