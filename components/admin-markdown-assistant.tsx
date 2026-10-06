'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './admin-fields';
import { markdownAiLimit, markdownLength, validateMarkdownInput, type MarkdownAiAction, type MarkdownAiResult, type MarkdownIssue } from '@/lib/markdown-ai';

type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string };
function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n'), b = after.split('\n');
  let start = 0, tail = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (tail < a.length - start && tail < b.length - start && a[a.length - tail - 1] === b[b.length - tail - 1]) tail++;
  const oldLines = a.slice(start, a.length - tail), newLines = b.slice(start, b.length - tail);
  const result: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }));
  if (oldLines.length * newLines.length > 250000) {
    result.push(...oldLines.map((text): DiffLine => ({ kind: 'removed', text })), ...newLines.map((text): DiffLine => ({ kind: 'added', text })));
  } else {
    const rows = Array.from({ length: oldLines.length + 1 }, () => new Uint16Array(newLines.length + 1));
    for (let i = oldLines.length - 1; i >= 0; i--)
      for (let j = newLines.length - 1; j >= 0; j--)
        rows[i][j] = oldLines[i] === newLines[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        result.push({ kind: 'same', text: oldLines[i++] }); j++;
      } else if (i < oldLines.length && (j === newLines.length || rows[i + 1][j] >= rows[i][j + 1])) {
        result.push({ kind: 'removed', text: oldLines[i++] });
      } else result.push({ kind: 'added', text: newLines[j++] });
    }
  }
  return [...result, ...a.slice(a.length - tail).map((text): DiffLine => ({ kind: 'same', text }))];
}

export function AdminMarkdownAssistant({ label, value, readMarkdown, applyMarkdown, onWorking, disabled, children }: {
  label: string; value: string; readMarkdown: () => string; applyMarkdown: (markdown: string) => void;
  onWorking: (working: boolean) => void; disabled: boolean; children: ReactNode;
}) {
  const [diagnosis, setDiagnosis] = useState<{ source: string; issues: MarkdownIssue[] } | null>(null);
  const [proposal, setProposal] = useState<{ source: string; markdown: string; name: string } | null>(null);
  const [working, setWorking] = useState<MarkdownAiAction | null>(null);
  const [message, setMessage] = useState('');
  const version = useRef(0), previousValue = useRef(value), pending = useRef<AbortController | null>(null);
  const callbacks = useRef({ readMarkdown, applyMarkdown, onWorking });
  useEffect(() => { callbacks.current = { readMarkdown, applyMarkdown, onWorking }; });
  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    version.current++;
    setDiagnosis(null); setProposal(null);
    setMessage(pending.current ? '正文已变化，本次 AI 结果将被丢弃，请重新操作。' : '');
  }, [value]);
  useEffect(() => () => {
    version.current++;
    if (pending.current) { pending.current.abort(); pending.current = null; callbacks.current.onWorking(false); }
  }, []);

  async function run(action: MarkdownAiAction) {
    if (pending.current || disabled) return;
    const source = callbacks.current.readMarkdown();
    try { validateMarkdownInput(source); }
    catch (error) { setMessage((error as Error).message); return; }
    if (action === 'markdown-repair' && (!diagnosis?.issues.length || diagnosis.source !== source)) {
      setDiagnosis(null); setMessage('请先对当前正文进行诊断。'); return;
    }
    const sourceVersion = version.current;
    const controller = new AbortController();
    pending.current = controller;
    setWorking(action); setMessage('正在处理正文…'); setProposal(null);
    if (action === 'markdown-diagnose') setDiagnosis(null);
    callbacks.current.onWorking(true);
    try {
      const result = await api<MarkdownAiResult>('/api/admin/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ action, markdown: source, ...(action === 'markdown-repair' ? { issues: diagnosis!.issues } : {}) }),
      });
      if (pending.current !== controller) return;
      if (sourceVersion !== version.current || source !== callbacks.current.readMarkdown()) {
        setMessage('正文已变化，AI 结果已丢弃，请重新操作。'); return;
      }
      if (action === 'markdown-diagnose' && 'issues' in result) {
        setDiagnosis({ source, issues: result.issues });
        setMessage(result.issues.length ? `诊断完成，发现 ${result.issues.length} 条建议。` : '诊断完成，未发现需要修改的问题。');
      } else if ('markdown' in result) {
        if (result.markdown === source) setMessage('当前正文无需修改。');
        else {
          setProposal({ source, markdown: result.markdown, name: action === 'markdown-repair' ? '修复' : '润色' });
          setMessage('修订稿已生成，查看差异后可以应用到编辑器。');
        }
      } else throw new Error('AI 返回的结果格式无效，原文已保留。');
    } catch (error) {
      if (pending.current === controller) setMessage(error instanceof Error ? error.message : 'AI 处理失败，原文已保留。');
    } finally {
      if (pending.current === controller) {
        pending.current = null; setWorking(null); callbacks.current.onWorking(false);
      }
    }
  }
  function apply() {
    if (!proposal || working || disabled) return;
    if (proposal.source !== callbacks.current.readMarkdown()) {
      setProposal(null); setDiagnosis(null); setMessage('正文已变化，请重新生成修订稿。'); return;
    }
    previousValue.current = proposal.markdown;
    version.current++;
    callbacks.current.applyMarkdown(proposal.markdown);
    setProposal(null); setDiagnosis(null);
    setMessage('已应用到编辑器，点击“确认提交”后保存。');
  }
  const length = markdownLength(value);
  const unavailable = disabled || Boolean(working) || !value.trim() || length > markdownAiLimit;
  return <div className="admin-wide article-markdown">
    <div className="admin-markdown-heading">
      <h3>{label}</h3>
      <div className="admin-markdown-actions" aria-label={`${label} AI 助手`}>
        <button type="button" disabled={unavailable} onClick={() => void run('markdown-diagnose')}>{working === 'markdown-diagnose' ? '诊断中…' : '诊断'}</button>
        <button type="button" disabled={unavailable || !diagnosis?.issues.length || diagnosis.source !== value} onClick={() => void run('markdown-repair')}>{working === 'markdown-repair' ? '修复中…' : '修复问题'}</button>
        <button type="button" disabled={unavailable} onClick={() => void run('markdown-polish')}>{working === 'markdown-polish' ? '润色中…' : '文本润色'}</button>
      </div>
    </div>
    <p className="admin-markdown-ai-help">AI 使用已保存的文本模型，全文发送到配置的 AI 服务；单次最多 12,000 个字符。修订稿需确认应用。</p>
    {length > markdownAiLimit && <output className="admin-markdown-ai-limit">正文共 {length.toLocaleString()} 个字符，已超过 AI 单次处理上限，请缩短到 12,000 个字符以内。</output>}
    {children}
    <output className="admin-markdown-ai-message" aria-live="polite">{message}</output>
    {diagnosis && <details className="admin-markdown-report" open>
      <summary>文稿诊断 · {diagnosis.issues.length} 条建议</summary>
      {diagnosis.issues.length ? <ol>{diagnosis.issues.map((issue, index) => <li key={index}>
        <div className="admin-markdown-issue-heading"><strong>{issue.category}</strong><span>{issue.location}</span></div>
        <blockquote>{issue.excerpt}</blockquote>
        <p><b>建议：</b>{issue.suggestion}</p><p className="admin-markdown-issue-reason">{issue.reason}</p>
      </li>)}</ol> : <p>未发现需要修改的问题。</p>}
    </details>}
    {proposal && <section className="admin-markdown-proposal" aria-label="Markdown 修订稿">
      <div className="admin-markdown-proposal-heading"><h4>{proposal.name} · 修改对比</h4><span>− 删除　＋ 新增</span></div>
      <pre className="admin-markdown-diff" aria-label="Markdown 修改差异">{diffLines(proposal.source, proposal.markdown).map((line, index) =>
        <span className={`diff-${line.kind}`} key={index}>{line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ' '} {line.text || ' '}</span>)}</pre>
      <div className="admin-markdown-proposal-actions">
        <button type="button" disabled={Boolean(working) || disabled} onClick={apply}>应用到编辑器</button>
        <button type="button" disabled={Boolean(working)} onClick={() => { setProposal(null); setMessage('修订稿已放弃，原文已保留。'); }}>放弃修订稿</button>
      </div>
    </section>}
  </div>;
}
