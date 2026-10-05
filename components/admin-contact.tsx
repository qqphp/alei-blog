'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './admin-fields';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './ui/dialog';
import type { MailSettings } from '@/lib/contact-mail';

type Settings = { value: MailSettings; configured: boolean; revision: number };
const labels = { smtpHost: 'SMTP 服务器', smtpPort: 'SMTP 端口（TLS）', imapHost: 'IMAP 服务器', imapPort: 'IMAP 端口（TLS）', sender: '发信邮箱', recipient: '收信邮箱' };
export function AdminMailSettings({ onDirty, onWorking }: { onDirty: (value: boolean) => void; onWorking: (value: boolean) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [original, setOriginal] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const dirty = Boolean(settings && (JSON.stringify(settings.value) !== original || password));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => { onWorking(busy); }, [busy, onWorking]);
  useEffect(() => {
    let current = true;
    void api<Settings>('/api/admin/mail-settings').then((value) => {
      if (current) { setSettings(value); setOriginal(JSON.stringify(value.value)); }
    }).catch((error) => { if (current) setNotice(String(error)); });
    return () => { current = false; };
  }, []);
  async function test(action: 'connection' | 'mail') {
    setBusy(true); setNotice('');
    try { setNotice((await api<{ message: string }>('/api/admin/mail-settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })).message); }
    catch (error) { setNotice(String(error)); } finally { setBusy(false); }
  }
  return <section className="admin-form" aria-label="邮箱设置"><h2>邮箱设置</h2>
    <p>验证码与留言通知通过 SMTP 发送。IMAP 仅用于连接检查。此处授权码加密保存，留空保留原值；本地 SMTP_AUTH_CODE 配置优先。</p>
    {settings && <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setNotice('');
      try {
        const result = await api<Settings>('/api/admin/mail-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: settings.value, password, revision: settings.revision }) });
        setSettings(result); setOriginal(JSON.stringify(result.value)); setPassword(''); setNotice('邮箱配置已保存。');
      } catch (error) { setNotice(String(error)); } finally { setBusy(false); }
    }}><fieldset disabled={busy} className="admin-mail-fields">
      <label className="admin-mail-enabled"><input type="checkbox" checked={settings.value.enabled} onChange={(event) => setSettings({ ...settings, value: { ...settings.value, enabled: event.target.checked } })} />启用邮箱验证留言</label>
      {Object.entries(labels).map(([key, label]) => {
        const field = key as keyof typeof labels;
        return <label key={field} htmlFor={`mail-${field}`}>{label}<input id={`mail-${field}`} required type={field.endsWith('Port') ? 'number' : field === 'sender' || field === 'recipient' ? 'email' : 'text'}
          min={field.endsWith('Port') ? 1 : undefined} max={field.endsWith('Port') ? 65535 : undefined}
          value={settings.value[field]} onChange={(event) => setSettings({ ...settings, value: { ...settings.value, [field]: field.endsWith('Port') ? Number(event.target.value) : event.target.value } })} /></label>;
      })}
      <label htmlFor="mail-password">邮箱授权码<input id="mail-password" type="password" autoComplete="new-password" maxLength={512} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={settings.configured ? '已配置，留空保留' : '尚未配置'} /></label>
    </fieldset><div className="admin-form-actions admin-mail-actions"><button type="submit" className="admin-primary" disabled={busy || !dirty}>保存邮箱设置</button>
      <button type="button" disabled={busy || dirty || !settings.configured} onClick={() => void test('connection')}>检查连接</button>
      <button type="button" disabled={busy || dirty || !settings.configured || !settings.value.enabled} onClick={() => void test('mail')}>发送测试邮件</button></div></form>}
    <output aria-live="polite">{notice}</output>
  </section>;
}
type ContactRecord = { id: string; email: string; status: string; created_at: string; content?: string; recipient?: string; attempts?: number; last_error?: string; next_attempt_at?: string; expires_at?: string; failures?: number };
const statuses: Record<string, string> = { pending: '待通知', sending: '发送中', retry: '等待重试', sent: '已发送', failed: '发送失败', expired: '已过期', superseded: '已被新码替代', consumed: '已使用', locked: '错误次数超限' };
function time(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'; }
export function AdminContactRecords({ kind }: { kind: 'messages' | 'codes' }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: ContactRecord[]; total: number } | null>(null);
  const [detail, setDetail] = useState<ContactRecord | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => {
      if (current) { setLoading(true); setNotice(''); }
      return api<{ items: ContactRecord[]; total: number }>(`/api/admin/contact/${kind}?${new URLSearchParams({ q: query, status, page: String(page) })}`);
    })
      .then((result) => { if (current) setData(result); }).catch((error) => { if (current) setNotice(String(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [kind, query, status, page]);
  const choices = kind === 'messages' ? ['pending','sending','retry','sent','failed'] : ['sending','sent','failed','expired','superseded','consumed','locked'];
  return <section className="admin-writing-table" aria-label={kind === 'messages' ? '留言记录' : '验证码记录'}>
    <p>仅供查看。{kind === 'codes' ? '验证码不显示明文，记录保留 30 天。' : '留言长期保留，通知失败自动重试。'}</p>
    <div className="admin-table-toolbar"><input type="search" aria-label="搜索私密记录" placeholder={kind === 'messages' ? '搜索邮箱或留言内容' : '搜索邮箱'} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setDetail(null); }} />
      <select aria-label="按发送状态筛选" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setDetail(null); }}><option value="">全部状态</option>{choices.map((item) => <option key={item} value={item}>{statuses[item]}</option>)}</select></div>
    <div className="admin-table-scroll"><table className="admin-data-table"><caption>共 {data?.total ?? 0} 条；每页最多 20 条</caption><thead><tr><th>邮箱</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>
      {data?.items.map((item) => <tr key={item.id}><td>{item.email}{item.content && <small>{item.content.slice(0, 80)}</small>}</td><td>{time(item.created_at)}</td><td>{statuses[item.status] ?? item.status}</td><td><button type="button" onClick={(event) => { detailTrigger.current = event.currentTarget; setDetail(item); }}>查看详情</button></td></tr>)}
    </tbody></table></div>
    {!loading && !data?.items.length && <p className="admin-empty">暂无记录。</p>}
    <nav className="admin-table-pagination" aria-label="私密记录分页"><span>第 {page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 20))} 页</span><button type="button" disabled={loading || page <= 1} onClick={() => { setPage(page - 1); setDetail(null); }}>上一页</button><button type="button" disabled={loading || page >= Math.ceil((data?.total ?? 0) / 20)} onClick={() => { setPage(page + 1); setDetail(null); }}>下一页</button></nav>
    <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
      <DialogContent className="admin-contact-dialog" showCloseButton={false} finalFocus={detailTrigger}>
        <div className="admin-contact-dialog-heading"><DialogTitle>{kind === 'messages' ? '留言详情' : '验证码详情'}</DialogTitle><DialogClose>关闭详情</DialogClose></div>
        <div className="admin-contact-detail">{detail && <dl>
      <dt>编号</dt><dd>{detail.id}</dd><dt>邮箱</dt><dd>{detail.email}</dd><dt>创建时间</dt><dd>{time(detail.created_at)}</dd><dt>状态</dt><dd>{statuses[detail.status]}</dd>
      {kind === 'messages' ? <><dt>收信邮箱</dt><dd>{detail.recipient}</dd><dt>通知尝试次数</dt><dd>{detail.attempts} / 5</dd><dt>下次尝试</dt><dd>{detail.status === 'retry' || detail.status === 'pending' ? time(detail.next_attempt_at) : '—'}</dd><dt>失败说明</dt><dd>{detail.last_error || '—'}</dd><dt>留言内容</dt><dd className="admin-contact-content">{detail.content}</dd></> : <><dt>有效期截止</dt><dd>{time(detail.expires_at)}</dd><dt>输错次数</dt><dd>{detail.failures} / 5</dd></>}
        </dl>}</div>
      </DialogContent>
    </Dialog>
    <output aria-live="polite">{loading ? '正在加载…' : notice}</output>
  </section>;
}
