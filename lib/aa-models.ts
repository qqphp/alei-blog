import { bindings } from './cms-server';
import { queryOne, withDatabase } from './postgres';

const cacheKey = 'language-models-free';
const endpoint = 'https://artificialanalysis.ai/api/v2/language/models/free';
const cacheLifetime = 24 * 60 * 60 * 1000;
let pendingRefresh: Promise<ModelDataResult> | null = null;
let retryAfter = 0;

type UnknownRecord = Record<string, unknown>;

type ModelValue = {
  id: string;
  name: string;
  releaseDate: string | null;
  intelligence: number | null;
  coding: number | null;
  agentic: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
  outputSpeed: number | null;
};

export type ModelGroup = {
  provider: string;
  models: ModelValue[];
};

export type ModelDataResult = {
  groups: ModelGroup[];
  fetchedAt: string;
  stale: boolean;
  refreshFailed: boolean;
  modelCount: number;
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateField(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function parsePages(payload: string): UnknownRecord[] | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const pages = parsed.map(record);
    if (
      pages.some(
        (page) => !page || !Array.isArray(page.data),
      )
    )
      return null;
    return pages as UnknownRecord[];
  } catch {
    return null;
  }
}

function groupsFromPages(pages: UnknownRecord[]): ModelGroup[] {
  const grouped = new Map<string, ModelValue[]>();
  for (const page of pages) {
    for (const rawModel of page.data as unknown[]) {
      const model = record(rawModel);
      const name = typeof model?.name === 'string' ? model.name : '';
      if (!model || !name) continue;

      const creator = record(model.model_creator);
      const provider =
        typeof creator?.name === 'string' && creator.name.trim()
          ? creator.name.trim()
          : '未知厂商';
      const evaluations = record(model.evaluations);
      const pricing = record(model.pricing);
      const performance = record(model.performance);
      const id =
        (typeof model.id === 'string' && model.id) ||
        (typeof model.slug === 'string' && model.slug) ||
        name;
      const models = grouped.get(provider) ?? [];
      models.push({
        id,
        name,
        releaseDate: dateField(model.release_date),
        intelligence: numberField(
          evaluations?.artificial_analysis_intelligence_index,
        ),
        coding: numberField(evaluations?.artificial_analysis_coding_index),
        agentic: numberField(evaluations?.artificial_analysis_agentic_index),
        inputPrice: numberField(pricing?.price_1m_input_tokens),
        outputPrice: numberField(pricing?.price_1m_output_tokens),
        outputSpeed: numberField(
          performance?.median_output_tokens_per_second,
        ),
      });
      grouped.set(provider, models);
    }
  }

  const compareDates = (left: ModelValue, right: ModelValue) => {
    const leftDate = left.releaseDate ? Date.parse(left.releaseDate) : NaN;
    const rightDate = right.releaseDate ? Date.parse(right.releaseDate) : NaN;
    if (!Number.isFinite(leftDate)) return Number.isFinite(rightDate) ? 1 : 0;
    if (!Number.isFinite(rightDate)) return -1;
    return rightDate - leftDate;
  };

  return [...grouped.entries()]
    .map(([provider, models]) => ({
      provider,
      models: models.sort(compareDates),
    }))
    .sort((left, right) => {
      const leftDate = left.models[0]?.releaseDate;
      const rightDate = right.models[0]?.releaseDate;
      if (!leftDate) return rightDate ? 1 : left.provider.localeCompare(right.provider);
      if (!rightDate) return -1;
      return Date.parse(rightDate) - Date.parse(leftDate);
    });
}

async function readSnapshot() {
  const saved = await queryOne<{ payload: unknown; storedAt: Date }>(
    'SELECT payload, stored_at AS "storedAt" FROM aa_language_model_snapshots WHERE key = $1',
    [cacheKey],
  );
  return saved ? { payload: JSON.stringify(saved.payload), storedAt: saved.storedAt.toISOString() } : null;
}

async function configuredKey() {
  const saved = await queryOne<{ apiKey: string }>(
    'SELECT api_key AS "apiKey" FROM api_integration_keys WHERE service = $1',
    ['artificialanalysis'],
  );
  return saved?.apiKey.trim() || bindings().AA_API_KEY?.trim() || '';
}

async function fetchAllPages(apiKey: string) {
  const pages: UnknownRecord[] = [];
  let page = 1;
  while (true) {
    if (page > 100) throw new Error('模型数据分页数量异常。');
    const url = new URL(endpoint);
    url.searchParams.set('page', String(page));
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      throw new Error('Artificial Analysis 接口暂时无法连接。');
    }
    if (!response.ok) {
      throw new Error(
        response.status === 429
          ? 'Artificial Analysis 接口请求次数已达上限。'
          : `Artificial Analysis 接口返回错误（${response.status}）。`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new Error('Artificial Analysis 接口返回的数据格式无效。');
    }
    const result = record(parsed);
    const pagination = record(result?.pagination);
    if (
      !result ||
      !Array.isArray(result.data) ||
      typeof pagination?.has_more !== 'boolean'
    )
      throw new Error('Artificial Analysis 接口返回的数据格式无效。');

    pages.push(result);
    if (!pagination.has_more) break;
    page += 1;
  }
  return pages;
}

async function saveSnapshot(pages: UnknownRecord[]) {
  const storedAt = new Date().toISOString();
  await withDatabase((db) => db.query(
    `INSERT INTO aa_language_model_snapshots (key, payload, stored_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, stored_at = excluded.stored_at`,
    [cacheKey, JSON.stringify(pages), storedAt],
  ).then(() => undefined));
  return storedAt;
}

async function loadLanguageModels(): Promise<ModelDataResult> {
  const snapshot = await readSnapshot();
  const pages = snapshot ? parsePages(snapshot.payload) : null;
  const storedTime = snapshot ? Date.parse(snapshot.storedAt) : NaN;
  const validStoredAt = Number.isFinite(storedTime);

  if (
    pages &&
    validStoredAt &&
    Date.now() - storedTime <= cacheLifetime
  ) {
    const groups = groupsFromPages(pages);
    return {
      groups,
      fetchedAt: snapshot!.storedAt,
      stale: false,
      refreshFailed: false,
      modelCount: groups.reduce((sum, group) => sum + group.models.length, 0),
    };
  }

  if (Date.now() < retryAfter) {
    if (!pages || !validStoredAt) throw new Error('大模型数据暂不可用，请稍后重试。');
    const groups = groupsFromPages(pages);
    return { groups, fetchedAt: snapshot!.storedAt, stale: true, refreshFailed: true,
      modelCount: groups.reduce((sum, group) => sum + group.models.length, 0) };
  }
  try {
    const apiKey = await configuredKey();
    if (!apiKey) throw new Error('尚未配置 Artificial Analysis API 密钥。');
    const freshPages = await fetchAllPages(apiKey);
    const fetchedAt = await saveSnapshot(freshPages);
    const groups = groupsFromPages(freshPages);
    return {
      groups,
      fetchedAt,
      stale: false,
      refreshFailed: false,
      modelCount: groups.reduce((sum, group) => sum + group.models.length, 0),
    };
  } catch {
    retryAfter = Date.now() + 60000;
    if (!pages || !validStoredAt) throw new Error('大模型数据暂不可用，请稍后重试。');
    const groups = groupsFromPages(pages);
    return {
      groups,
      fetchedAt: snapshot!.storedAt,
      stale: true,
      refreshFailed: true,
      modelCount: groups.reduce((sum, group) => sum + group.models.length, 0),
    };
  }
}

export function getLanguageModels(): Promise<ModelDataResult> {
  pendingRefresh ??= loadLanguageModels().finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}
