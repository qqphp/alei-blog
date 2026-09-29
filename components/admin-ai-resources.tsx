'use client';
import type { Json } from '@/lib/cms-validation';
import { Field } from './admin-fields';

const visibleFields: Record<string, string[]> = {
  agents: ['name', 'creator', 'logo', 'description', 'tags', 'status', 'href', '_published'],
  skills: ['name', 'title', 'categoryId', 'description', 'href', '_published'],
  relays: ['name', 'href', 'logo', 'mark', 'description', '_published'],
  skillCategories: ['name', 'parentId'],
};

export function AdminAiResources({ collection, value, sample, skillCategories, onChange }: {
  collection: string; value: Json; sample: Json;
  skillCategories: { id: string; name: string; parentId?: string }[];
  onChange: (value: Json) => void;
}) {
  const record = value as Record<string, Json>;
  const template = sample as Record<string, Json>;
  const keys = visibleFields[collection];
  const names = new Map(skillCategories.map((item) => [item.id, item.name]));
  const options: Record<string, { id: string; name: string }[]> = collection === 'agents' ? { status: [
    { id: 'active', name: '可使用' }, { id: 'beta', name: '公测中' }, { id: 'coming', name: '即将推出' },
  ] } : collection === 'skills' ? { categoryId: skillCategories.map((item) => ({
    id: item.id, name: item.parentId ? `${names.get(item.parentId)} / ${item.name}` : item.name,
  })) } : collection === 'skillCategories' ? { parentId: skillCategories.filter((item) =>
    !item.parentId && item.id !== record.id).map((item) => ({ id: item.id, name: item.name })) } : {};
  return <Field path={`ai.${collection}`} label={collection === 'skillCategories' ? 'Skills分类' : '资源信息'}
    value={Object.fromEntries(keys.map((key) => [key, record[key]]))}
    sample={Object.fromEntries(keys.map((key) => [key, template[key]]))}
    options={options}
    onChange={(next) => onChange({ ...record, ...(next as Record<string, Json>) })} />;
}
