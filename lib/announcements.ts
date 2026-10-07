export type Announcement = {
  id: string; title: string; categoryId: string; body: string;
  startAt: string; endAt: string; _published: boolean;
  createdAt?: string | null; updatedAt?: string;
};
export type AnnouncementCategory = { id: string; name: string };
export type PublicAnnouncement = Announcement & { category: string; updatedAt: string };
export const announcementSample: Announcement = {
  id: '', title: '', categoryId: '', body: '', startAt: '', endAt: '', _published: false,
};
export const announcementCategorySample: AnnouncementCategory = { id: '', name: '' };
export const announcementReadKey = 'alei-announcement-reads-v1';

export function validAnnouncementTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function shanghaiInput(value: string): string {
  if (!value) return '';
  return new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 19);
}

export function announcementTime(value: string): string {
  if (!value) return '';
  const full = value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(`${full}+08:00`);
  if (!Number.isFinite(parsed.getTime()) || shanghaiInput(parsed.toISOString()) !== full) return '';
  return parsed.toISOString();
}

export function activeAnnouncements<T extends Announcement>(items: T[], now: number): T[] {
  return items.filter((item) => item._published && validAnnouncementTime(item.startAt) &&
    Date.parse(item.startAt) <= now && (!item.endAt || (validAnnouncementTime(item.endAt) && now < Date.parse(item.endAt))))
    .sort((a, b) => b.startAt.localeCompare(a.startAt) || a.id.localeCompare(b.id));
}
