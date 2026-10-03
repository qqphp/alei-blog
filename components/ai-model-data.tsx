'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

type Model = {
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

type ModelResponse = {
  groups: Array<{ provider: string; models: Model[] }>;
  fetchedAt: string;
  stale: boolean;
  refreshFailed: boolean;
  modelCount: number;
  error?: string;
};

function numberText(value: number | null, suffix = '') {
  return value === null
    ? '—'
    : `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 5 }).format(value)}${suffix}`;
}

function priceText(value: number | null) {
  return value === null ? '—' : `$${numberText(value)}`;
}

function dateText(value: string | null) {
  return value ? value.replaceAll('-', '.') : '日期未知';
}

function dateTimeText(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : value;
}

function ModelMetrics({ model }: { model: Model }) {
  return (
    <dl className="ai-model-metrics">
      <div><dt>Intelligence</dt><dd>{numberText(model.intelligence)}</dd></div>
      <div><dt>Coding</dt><dd>{numberText(model.coding)}</dd></div>
      <div><dt>Agentic</dt><dd>{numberText(model.agentic)}</dd></div>
      <div><dt>输入 / 1M (USD)</dt><dd>{priceText(model.inputPrice)}</dd></div>
      <div><dt>输出 / 1M (USD)</dt><dd>{priceText(model.outputPrice)}</dd></div>
      <div><dt>输出速度</dt><dd>{numberText(model.outputSpeed, ' tok/s')}</dd></div>
    </dl>
  );
}

export function AiModelDataSection({
  active,
  onModelCountChange,
}: {
  active: boolean;
  onModelCountChange: (count: number) => void;
}) {
  const [data, setData] = useState<ModelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('');
  const groups = data?.groups ?? [];
  const selectedProviderName = groups.some((group) => group.provider === selectedProvider)
    ? selectedProvider
    : groups[0]?.provider ?? '';
  const selectedGroup = groups.find((group) => group.provider === selectedProviderName);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetch('/api/ai/models', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as ModelResponse;
        if (!response.ok) throw new Error(result.error || '模型数据暂不可用。');
        return result;
      })
      .then((result) => {
        setData(result);
        onModelCountChange(result.modelCount);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '模型数据暂不可用。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError('');
      }
    });
    return () => controller.abort();
  }, [active, attempt, onModelCountChange]);

  return (
    <section className="ai-section ai-model-data" aria-label="大模型数据">
      <div className="ai-model-data-heading">
        <div>
          <p>按厂商整理的模型基准、发布日期、价格与输出速度。</p>
        </div>
        <div className="ai-model-data-actions">
          <span>{data ? `${data.modelCount} 个模型` : loading ? '模型数据读取中' : '模型数据'}</span>
        </div>
      </div>

      <div className="ai-model-data-status" aria-live="polite">
        {loading && !data && <span>正在读取最新模型快照…</span>}
        {data && (
          <span className={data.stale ? 'is-stale' : ''}>
            {data.stale
              ? `刷新失败，当前展示过期快照 · 更新于 ${dateTimeText(data.fetchedAt)}`
              : `数据更新于 ${dateTimeText(data.fetchedAt)}`}
          </span>
        )}
        {error && !data && <span className="is-error">{error}</span>}
        {data?.refreshFailed && <span className="is-stale">请稍后重试。</span>}
      </div>

      <div className="ai-model-layout">
        <aside className="ai-model-sidebar" aria-label="模型厂商与指标说明">
          <div className="ai-model-vendors">
            <h3>厂商索引</h3>
            {groups.length > 8 ? (
              <label className="ai-model-vendor-picker">
                <span>选择厂商</span>
                <select
                  aria-label="选择模型厂商"
                  value={selectedProviderName}
                  onChange={(event) => setSelectedProvider(event.target.value)}
                >
                  {groups.map((group, index) => (
                    <option key={group.provider} value={group.provider}>
                      {String(index + 1).padStart(2, '0')} · {group.provider} · {group.models.length}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <nav className="ai-model-vendor-list" aria-label="厂商列表">
                {groups.map((group, index) => (
                  <button
                    key={group.provider}
                    type="button"
                    aria-pressed={group.provider === selectedProviderName}
                    onClick={() => setSelectedProvider(group.provider)}
                  >
                    <span>{group.provider}</span>
                    <small>{String(index + 1).padStart(2, '0')} · {group.models.length}</small>
                  </button>
                ))}
              </nav>
            )}
          </div>
          <section className="ai-model-guide" aria-labelledby="ai-model-guide-title">
            <h3 id="ai-model-guide-title">指标说明</h3>
            <dl>
              <div><dt>Intelligence</dt><dd>综合能力评分</dd></div>
              <div><dt>Coding</dt><dd>编程能力评分</dd></div>
              <div><dt>Agentic</dt><dd>智能体任务能力评分</dd></div>
              <div><dt>输入 / 输出价格</dt><dd>美元 / 每百万 tokens（1M）</dd></div>
              <div><dt>输出速度</dt><dd>每秒生成的 tokens 数（tok/s）</dd></div>
            </dl>
            <p>— 表示暂无数据</p>
            <a href="https://artificialanalysis.ai/" target="_blank" rel="noopener noreferrer">
              数据来源 · Artificial Analysis <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </section>
        </aside>

        <div className="ai-model-results">
          {selectedGroup && (
            <section className="ai-model-provider">
              <header>
                <span>{String(groups.indexOf(selectedGroup) + 1).padStart(2, '0')}</span>
                <h3>{selectedGroup.provider}</h3>
                <small>{selectedGroup.models.length} 个模型</small>
              </header>
              <div className="ai-model-desktop-wrap">
                <table className="ai-model-data-table">
                  <thead>
                    <tr>
                      <th>模型</th>
                      <th>发布日期</th>
                      <th>Intelligence</th>
                      <th>Coding</th>
                      <th>Agentic</th>
                      <th>输入 / 1M (USD)</th>
                      <th>输出 / 1M (USD)</th>
                      <th>输出速度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.models.map((model) => (
                      <tr key={model.id}>
                        <td>{model.name}</td>
                        <td>{dateText(model.releaseDate)}</td>
                        <td>{numberText(model.intelligence)}</td>
                        <td>{numberText(model.coding)}</td>
                        <td>{numberText(model.agentic)}</td>
                        <td>{priceText(model.inputPrice)}</td>
                        <td>{priceText(model.outputPrice)}</td>
                        <td>{numberText(model.outputSpeed, ' tok/s')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ai-model-mobile-list">
                {selectedGroup.models.map((model) => (
                  <article key={model.id}>
                    <div className="ai-model-mobile-heading">
                      <h4>{model.name}</h4>
                      <time>{dateText(model.releaseDate)}</time>
                    </div>
                    <ModelMetrics model={model} />
                  </article>
                ))}
              </div>
            </section>
          )}
          {data && groups.length === 0 && (
            <p className="ai-empty">接口尚未返回模型数据。</p>
          )}
        </div>
      </div>

      {error && data && <p className="ai-model-inline-error">{error}</p>}
      {error && !data && (
        <button
          className="ai-model-retry"
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          重试 <ArrowUpRight size={15} />
        </button>
      )}

    </section>
  );
}
