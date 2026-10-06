'use client';

import type { ReactNode } from 'react';
import {
  BookOpen,
  Film,
  Headphones,
  Map,
  Mic,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export type LifeHeaderKind =
  | 'music'
  | 'films'
  | 'podcasts'
  | 'travel'
  | 'hobbies'
  | 'books';

type HeaderNote = {
  icon: LucideIcon;
  lines: [string, string];
  meta: string;
};

const headerNotes: Record<LifeHeaderKind, HeaderNote> = {
  music: {
    icon: Headphones,
    lines: ["让声音留在日常里，", "也留一点空白给自己。"],
    meta: "喜欢的旋律，陪着日常。",
  },
  films: {
    icon: Film,
    lines: ["电影散场以后，", "故事仍在心里继续。"],
    meta: "灯光暗下，故事亮起。",
  },
  podcasts: {
    icon: Mic,
    lines: ["给问题多一点时间，", "给不同声音一个座位。"],
    meta: "听见别人，也听见自己。",
  },
  travel: {
    icon: Map,
    lines: ["走得慢一点，", "沿途才会真正出现。"],
    meta: "走走停停，看看世界。",
  },
  hobbies: {
    icon: Sparkles,
    lines: ["不为擅长，", "只是愿意再次开始。"],
    meta: "心有所好，日有所乐。",
  },
  books: {
    icon: BookOpen,
    lines: ["一本一本地读，", "一点一点地积累。"],
    meta: "翻过一页，多见一点世界。",
  },
};

export function LifePageHeader({
  kind,
  title,
  intro,
}: {
  kind: LifeHeaderKind;
  title: ReactNode;
  intro: ReactNode;
}) {
  const note = headerNotes[kind];
  const Icon = note.icon;

  return (
    <header className="life-page-heading">
      <div className="life-page-heading-main">
        <p className="life-overline">
          {"OFF THE CLOCK / 生活索引"}
        </p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <aside className="life-page-heading-aside">
        <Icon size={30} strokeWidth={1} aria-hidden="true" />
        <p>
          {note.lines[0]}
          <br />
          {note.lines[1]}
        </p>
        <span>
          {note.meta}
        </span>
      </aside>
    </header>
  );
}
