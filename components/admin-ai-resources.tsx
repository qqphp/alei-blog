'use client';
import type { Json } from '@/lib/cms-validation';
import { Field } from './admin-fields';

const visibleFields: Record<string, string[]> = {
  agents: ['name', 'creator', 'href', 'logo', 'description', 'tags', 'status', '_published'],
  skills: ['name', 'title', 'categoryId', 'description', 'href', '_published'],
  relays: ['name', 'href', 'logo', 'mark', 'description', '_published'],
  agentStatuses: ['name'],
  skillCategories: ['name', 'parentId'],
};

export function AdminAiResources({ collection, value, sample, agentStatuses, skillCategories, onChange }: {
  collection: string; value: Json; sample: Json;
  agentStatuses: { id: string; name: string }[];
  skillCategories: { id: string; name: string; parentId?: string }[];
  onChange: (value: Json) => void;
}) {
  const record = value as Record<string, Json>;
  const template = sample as Record<string, Json>;
  const keys = visibleFields[collection];
  const names = new Map(skillCategories.map((item) => [item.id, item.name]));
  const options: Record<string, { id: string; name: string }[]> = collection === 'agents' ? { status: agentStatuses } : collection === 'skills' ? { categoryId: skillCategories.map((item) => ({
    id: item.id, name: item.parentId ? `${names.get(item.parentId)} / ${item.name}` : item.name,
  })) } : collection === 'skillCategories' ? { parentId: skillCategories.filter((item) =>
    !item.parentId && item.id !== record.id).map((item) => ({ id: item.id, name: item.name })) } : {};
  return <Field path={`ai.${collection}`} label={collection === 'skillCategories' ? 'Skills分类' : collection === 'agentStatuses' ? '智能体状态' : '资源信息'}
    value={Object.fromEntries(keys.map((key) => [key, record[key]]))}
    sample={Object.fromEntries(keys.map((key) => [key, template[key]]))}
    options={options}
    onChange={(next) => onChange({ ...record, ...(next as Record<string, Json>) })} />;
}
