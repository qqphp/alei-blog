export type RecordTimes = { createdAt: string | null; updatedAt: string };

export function articleCreationDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value)).replaceAll('-', '.');
}

export function recordTimes(row: { createdAt: Date | string | null; updatedAt: Date | string }): RecordTimes {
  return { createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: new Date(row.updatedAt).toISOString() };
}

export function newestCreatedFirst<T extends { createdAt?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export function formatRecordTime(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)) : '历史创建时间未知';
}
