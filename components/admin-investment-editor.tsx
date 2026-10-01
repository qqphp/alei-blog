'use client';
import type { Json } from '@/lib/cms-validation';
import { Field } from './admin-fields';
import { AdminMarkdownEditor } from './admin-markdown-editor';

export function AdminInvestmentEditor({ value, sample, columns, onChange, onWorking }: {
  value: Json; sample: Json; columns: { id: string; name: string }[];
  onChange: (value: Json) => void;
  onWorking?: (working: boolean) => void;
}) {
  const record = value as Record<string, Json>;
  const template = sample as Record<string, Json>;
  const keys = ['title', 'description', 'sectionId'];
  return <div className="admin-investment-editor">
    <Field path="investing.entries" label="文章信息"
      value={Object.fromEntries(keys.map((key) => [key, record[key]]))}
      sample={Object.fromEntries(keys.map((key) => [key, template[key]]))}
      options={{ sectionId: columns }}
      onChange={(next) => onChange({ ...record, ...(next as Record<string, Json>) })} />
    <AdminMarkdownEditor label="正文" value={(record.paragraphs as string[]).join('\n\n')}
      onWorking={onWorking}
      onChange={(markdown) => onChange({ ...record, paragraphs: [markdown] })} />
    <Field path="investing.entries._published" label="发布到前台"
      value={record._published} sample={template._published}
      onChange={(published) => onChange({ ...record, _published: published })} />
  </div>;
}
