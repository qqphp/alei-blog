'use client';
import { useEffect, useState } from 'react';

async function post(path: string, body: unknown) {
  const response = await fetch(`/api/contact/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.error ?? '提交失败，请稍后再试'), { retryAt: value.retryAt });
  return value;
}
export function ContactForm() {
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [code, setCode] = useState('');
  const [website, setWebsite] = useState('');
  const [challenge, setChallenge] = useState('');
  const [expires, setExpires] = useState(0);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState<'code' | 'message' | ''>('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!expires && !retry) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expires, retry]);
  const cooldown = Math.max(0, Math.ceil((retry - clock) / 1000));
  const remaining = Math.max(0, Math.ceil((expires - clock) / 1000));
  return <section className="profile-message" id="profile-message">
    <div><p className="profile-kicker">03 / 留言</p><h2>留几句话，慢慢聊。</h2>
      <p className="profile-message-intro">见字如面，你的分享与想法，都值得被认真倾听。</p>
      <svg className="profile-message-art" viewBox="0 0 340 260" aria-hidden="true" focusable="false">
        <circle cx="164" cy="134" r="108" fill="currentColor" opacity=".04" />
        <path d="M50 230h242" stroke="currentColor" opacity=".18" />
        <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="m65 139 100-72 100 72v82H65Z" fill="var(--navy)" />
          <g transform="rotate(-8 163 128)">
            <rect x="98" y="48" width="133" height="162" rx="3" fill="var(--navy)" />
            <path d="M116 77h51M116 96h92M116 112h77M116 128h88M116 144h60" opacity=".4" />
            <path d="M187 166c-9-13-26 1 0 17 26-16 9-30 0-17Z" fill="currentColor" fillOpacity=".1" />
          </g>
          <path d="m65 139 100 69 100-69v82H65Z" fill="var(--navy)" />
          <path d="m65 221 76-55m124 55-76-55" />
          <path d="m252 60 11 5-34 80-12 14 2-19Z" fill="var(--navy)" />
          <path d="m252 60 11 5-7 17-11-5Z" fill="currentColor" fillOpacity=".16" />
          <path d="m222 140 7 5m-12 14 3-9m47-78 6 3-16 37" />
          <path d="M63 80v12m-6-6h12M285 164v10m-5-5h10" opacity=".4" />
          <circle cx="279" cy="127" r="3" opacity=".4" />
        </g>
      </svg></div>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy || !challenge || !remaining) return;
      setBusy('message'); setNotice('');
      try {
        const result = await post('messages', { email, content, code, challengeId: challenge, website });
        setContent(''); setCode(''); setChallenge(''); setExpires(0);
        setNotice(`留言已保存，谢谢你的来信。编号：${result.id}`);
      } catch (error) { setNotice(error instanceof Error ? error.message : '提交失败'); }
      finally { setBusy(''); }
    }}>
      <label htmlFor="contact-content">留言内容</label>
      <textarea id="contact-content" value={content} onChange={(event) => setContent(event.target.value)} rows={4}
        required maxLength={3000} disabled={Boolean(busy)} placeholder="想交流的问题，或想分享的想法…" />
      <small>{Array.from(content).length} / 3000 字</small>
      <label htmlFor="contact-email">留言邮箱</label>
      <div className="profile-message-email"><input id="contact-email" type="email" autoComplete="email" maxLength={254} required
        disabled={Boolean(busy)} value={email} onChange={(event) => {
          setEmail(event.target.value); setChallenge(''); setCode(''); setExpires(0); setNotice('');
        }} placeholder="你的邮箱地址" />
        <button type="button" disabled={Boolean(busy) || !email.trim() || cooldown > 0} onClick={async () => {
          if (!document.querySelector<HTMLInputElement>('#contact-email')?.reportValidity()) return;
          setBusy('code'); setNotice('');
          try {
            const result = await post('codes', { email, website });
            setChallenge(result.challengeId); setExpires(Date.parse(result.expiresAt)); setRetry(Date.parse(result.retryAt));
            setCode(''); setClock(Date.now()); setNotice('验证码已发送，请查看邮箱。');
          } catch (error) {
            if (error instanceof Error && 'retryAt' in error && typeof error.retryAt === 'string') {
              setRetry(Date.parse(error.retryAt)); setClock(Date.now());
            }
            setNotice(error instanceof Error ? error.message : '发送失败');
          }
          finally { setBusy(''); }
        }}>{busy === 'code' ? '发送中…' : cooldown ? `${cooldown} 秒后重发` : '发送验证码'}</button></div>
      <div className="profile-message-bottom"><div><label htmlFor="contact-code">邮箱验证码</label>
        <input id="contact-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
          value={code} disabled={Boolean(busy)} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6 位数字" />
        <small>{challenge ? remaining ? `验证码有效期剩余 ${remaining} 秒` : '验证码已过期，请重新发送' : '验证码有效期 3 分钟，仅可使用一次'}</small></div>
        <button type="submit" disabled={Boolean(busy) || !challenge || !remaining || code.length !== 6 || !content.trim()}>{busy === 'message' ? '提交中…' : '提交留言 ↗'}</button></div>
      <small className="profile-message-privacy">留言仅供站点管理员查看，验证邮箱后即可提交；同一邮箱每天最多留言 3 次。</small>
      <div className="profile-honeypot" aria-hidden="true"><label htmlFor="contact-website">网站</label><input id="contact-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
      <output className="profile-message-notice" aria-live="polite">{notice}</output>
    </form>
  </section>;
}
