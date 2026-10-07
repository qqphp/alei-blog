'use client';

import { useEffect, useId, useState } from 'react';
import { FileText, Folder, MessageSquare, Bot, TrendingUp, User, Bookmark, Link, Music, Film, Mic,
  MapPin, Heart, BookOpen, Settings, Bell, PanelLeftClose, PanelLeftOpen, Menu, LogOut, X, ChevronRight, type LucideIcon } from 'lucide-react';
import { sectionLabels, type Section } from '@/lib/cms-defaults';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from './ui/sheet';

const groups: { id: string; label: string; sections: Section[] }[] = [
  { id: 'content', label: '内容', sections: ['writing', 'projects', 'stories', 'ai', 'investing', 'profile'] },
  { id: 'website', label: '网站', sections: ['bookmarks', 'friends'] },
  { id: 'life', label: '生活', sections: ['tracks', 'films', 'podcasts', 'travel', 'hobbies', 'books'] },
  { id: 'settings', label: '设置', sections: ['site', 'aiSettings', 'announcements'] },
];
const icons: Partial<Record<Section, LucideIcon>> = {
  writing: FileText, projects: Folder, stories: MessageSquare, ai: Bot, investing: TrendingUp, profile: User,
  bookmarks: Bookmark, friends: Link, tracks: Music, films: Film, podcasts: Mic, travel: MapPin,
  hobbies: Heart, books: BookOpen, aiSettings: Bot, site: Settings, announcements: Bell,
};
const storageKey = 'alei-admin-sidebar-collapsed';
const groupStorageKey = 'alei-admin-sidebar-groups';

export function AdminSidebar({ section, disabled, onSelect, onLogout }: {
  section: Section; disabled: boolean; onSelect: (section: Section) => boolean; onLogout: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [foldedGroups, setFoldedGroups] = useState<Record<string, boolean>>({});
  const navigationId = useId();
  useEffect(() => {
    const task = setTimeout(() => {
      try { setCollapsed(localStorage.getItem(storageKey) === 'true'); } catch { /* Optional preference. */ }
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(groupStorageKey) ?? '{}');
        if (saved && typeof saved === 'object' && !Array.isArray(saved))
          setFoldedGroups(Object.fromEntries(groups.map(({ id }) => [id, (saved as Record<string, unknown>)[id] === true])));
      } catch { /* Optional preference. */ }
    }, 0);
    return () => clearTimeout(task);
  }, []);
  function toggle() {
    const next = !collapsed; setCollapsed(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* Optional preference. */ }
  }
  function toggleGroup(id: string) {
    const next = { ...foldedGroups, [id]: !foldedGroups[id] };
    setFoldedGroups(next);
    try { localStorage.setItem(groupStorageKey, JSON.stringify(next)); } catch { /* Optional preference. */ }
  }
  function navigation(compact: boolean, placement: string) {
    return <>
      <nav aria-label="后台栏目">{groups.map((group) => {
        const expanded = compact || !foldedGroups[group.id];
        const submenuId = `${navigationId}-${placement}-${group.id}`;
        return <div className="admin-nav-group" key={group.id}>
        {!compact && <button className="admin-nav-group-label" type="button" aria-expanded={expanded}
          aria-controls={submenuId} onClick={() => toggleGroup(group.id)}>
          <span>{group.label}</span><ChevronRight size={14} aria-hidden="true" />
        </button>}
        <div id={submenuId} className="admin-nav-group-items" hidden={!expanded}>{group.sections.map((key) => {
          const Icon = icons[key] ?? Settings;
          return <button key={key} type="button" disabled={disabled} title={compact ? sectionLabels[key] : undefined}
            aria-label={sectionLabels[key]} aria-current={section === key ? 'page' : undefined}
            onClick={() => { if (onSelect(key)) setMobileOpen(false); }}>
            <Icon size={18} aria-hidden="true" /><span className="admin-nav-text">{sectionLabels[key]}</span>
          </button>;
        })}</div>
      </div>;
      })}</nav>
      <button className="admin-logout" type="button" disabled={disabled} title={compact ? '退出登录' : undefined}
        aria-label="退出登录" onClick={() => void onLogout()}><LogOut size={17} aria-hidden="true" /><span className="admin-nav-text">退出登录</span></button>
    </>;
  }
  return <>
    <aside className={`admin-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="admin-brand"><div><span>ALEI ADMIN</span><strong>后台管理系统</strong></div>
        <button className="admin-sidebar-toggle" type="button" onClick={toggle} aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          aria-expanded={!collapsed} title={collapsed ? '展开侧栏' : '收起侧栏'}>
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button></div>
      {navigation(collapsed, 'desktop')}
    </aside>
    <div className="admin-mobile-navigation"><Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger className="admin-mobile-trigger"><Menu size={20} />后台菜单</SheetTrigger>
      <SheetContent side="left" className="admin-mobile-drawer" showCloseButton={false}>
        <SheetClose className="admin-mobile-close" aria-label="关闭后台菜单"><X size={20} /></SheetClose>
        <SheetTitle className="admin-mobile-title">后台管理系统</SheetTitle>{navigation(false, 'mobile')}
      </SheetContent>
    </Sheet></div>
  </>;
}
