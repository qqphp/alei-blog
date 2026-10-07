import { withReadDatabase } from './postgres';
import { recordTimes } from './content-times';
import { activeAnnouncements, type Announcement, type PublicAnnouncement } from './announcements';

export function getActiveAnnouncements(): Promise<PublicAnnouncement[]> {
  return withReadDatabase(async (db) => {
    const rows = await db.query<{ payload: Announcement; category: string; createdAt: Date; updatedAt: Date }>(
      `SELECT e.payload, c.payload->>'name' AS category, e.created_at AS "createdAt", e.updated_at AS "updatedAt"
       FROM cms_entries e JOIN cms_entries c ON c.section=e.section AND c.collection='categories' AND c.id=e.category_id
       WHERE e.section='announcements' AND e.collection='items' AND e.published`);
    const clock = await db.query<{ now: Date }>('SELECT now() AS now');
    return activeAnnouncements(rows.rows.map((row) => ({ ...row.payload, ...recordTimes(row), category: row.category,
      _published: true })), clock.rows[0].now.getTime());
  });
}
