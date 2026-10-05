'use client';

import { useContent } from '@/components/content-provider';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Code2, Mail, MessageCircle, ScanLine } from 'lucide-react';
import { ContactForm } from './contact-form';

import './about-profile.css';

function ServiceIllustration() {
  return <svg className="profile-service-art" viewBox="0 0 120 120" aria-label="软件技术服务：代码窗口与数据库"><title>软件技术服务</title>
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="8" y="17" width="92" height="70" rx="5" fill="var(--navy)" />
      <path d="M8 32h92" /><circle cx="17" cy="24" r="1" /><circle cx="24" cy="24" r="1" /><circle cx="31" cy="24" r="1" />
      <path d="m32 46-12 11 12 11m23-22 12 11-12 11m-9-25-8 29M20 78h39" />
      <path d="M51 88v12m-16 0h32" />
      <path d="M77 68v28c0 5 34 5 34 0V68" fill="var(--navy)" /><ellipse cx="94" cy="68" rx="17" ry="5" fill="var(--navy)" />
      <path d="M77 77c0 6 34 6 34 0m-34 10c0 6 34 6 34 0" />
    </g>
  </svg>;
}

export function AboutProfile() {
  const { profile } = useContent();
  return <div className="profile-page">
    <header className="profile-index"><div className="profile-index-name"><span className="profile-index-mark" aria-hidden="true">{"A /"}</span><div><p className="profile-kicker">{"开发 / 记录 / 探索"}</p><h1>{profile.name}</h1></div></div><p>{"用代码做点东西，"}<br />{"用文字留住过程。"}</p><div className="profile-index-links"><a href="#profile-service">01 技术服务<ArrowUpRight size={14} /></a><a href="#profile-contact">02 关注与交流<ArrowUpRight size={14} /></a><a href="#profile-message">03 留言<ArrowUpRight size={14} /></a><a href="#profile-platforms">04 平台索引<ArrowUpRight size={14} /></a></div></header>
    <section className="profile-service" id="profile-service"><ServiceIllustration /><div><p className="profile-kicker">01 / 技术服务</p><h2>让想法，再向前一步。</h2><p>技术服务与购买入口，项目、价格及交付说明见商店。</p><a href={profile.serviceUrl} target="_blank" rel="noopener noreferrer">查看服务与购买<ArrowUpRight size={20} /></a></div><span className="profile-service-address">SHOP.QQPHP.COM</span></section>
    <section className="profile-connect" id="profile-contact">
      <article className="profile-account">
        <div className="profile-account-copy"><p className="profile-kicker">02 / 关注与交流</p><h2>{profile.followTitle}</h2><p>{profile.followDescription}</p><div className="profile-account-name"><MessageCircle size={19} />{profile.name}<span>微信公众号</span></div></div>
        <div className="profile-qr">{profile.communityQr ? <Image src={profile.communityQr} alt={`${profile.communityName || '交流群'}二维码`} width={220} height={220} /> : <div className="profile-qr-pending"><ScanLine size={38} /><strong>{profile.communityName || '交流群二维码'}</strong><span>图片待补充</span></div>}<p>{profile.communityName || '一起交流'}{profile.communityDescription && <><br />{profile.communityDescription}</>}</p></div>
        <div className="profile-qr">{profile.publicAccountQr ? <Image src={profile.publicAccountQr} alt={`${profile.name}微信公众号二维码，使用微信扫码关注`} width={220} height={220} /> : <div className="profile-qr-pending"><ScanLine size={38} /><strong>公众号二维码</strong><span>图片待补充</span></div>}<p>{profile.publicAccountQr ? `微信扫一扫 · 关注${profile.name}` : `也可以在微信内搜索「${profile.name}」`}</p></div>
      </article>
      <aside className="profile-contact"><p className="profile-kicker">打个招呼</p><h2>微信与邮箱</h2><div><MessageCircle size={18} /><span>联系微信<strong>{profile.wechat || '微信号待补充'}</strong></span></div><div><Mail size={18} /><span>联系邮箱{profile.email ? <a href={`mailto:${profile.email}`}>{profile.email} ↗</a> : <strong>邮箱待补充</strong>}</span></div></aside>
    </section>
    <ContactForm />
    <section className="profile-platforms" id="profile-platforms"><div className="profile-platform-heading"><div><p className="profile-kicker">{"04 / 散落在互联网"}</p><h2>{"平台索引"}</h2></div><p>{"不同的入口，同一个开发阿雷。"}</p></div><div className="profile-platform-grid">{profile.platforms.map((platform, i) => { const contents = <><span>{String(i + 1).padStart(2, '0')}</span><h3>{platform.name}</h3><p>{platform.label}</p><small>{platform.url ? '前往个人主页 ↗' : '个人主页待补充'}</small></>; return platform.url ? <a href={platform.url} target="_blank" rel="noopener noreferrer" key={platform.name}>{contents}</a> : <article key={platform.name}>{contents}</article>; })}</div></section>
    <section className="profile-interests" aria-label="认识我的几个入口"><div className="profile-section-label"><span>{"05 / 不止一面"}</span><h2>{"从这些小事，"}<br />{"认识我。"}</h2></div><Link href="/projects" className="profile-interest"><Code2 size={24} /><h3>{"把想法做出来"}</h3><p>{"看看那些从问题出发、逐渐成形的小项目。"}</p><span>{"打开项目档案 ↗"}</span></Link><Link href="/writing" className="profile-interest"><span className="profile-symbol" aria-hidden="true">Aa</span><h3>{"给思考留个底稿"}</h3><p>{"写下理解的过程，也留下还没有答案的问题。"}</p><span>{"翻翻我的写作 ↗"}</span></Link><Link href="/hobbies" className="profile-interest"><span className="profile-symbol" aria-hidden="true">✳</span><h3>{"认真地玩一会儿"}</h3><p>{"音乐、影像和日常里的小发现，都是新的入口。"}</p><span>{"去生活里逛逛 ↗"}</span></Link></section>
    <div className="profile-signoff"><p>{"保持好奇，"}<span>{"继续动手。"}</span></p><span aria-hidden="true">{"开发阿雷 / 持续生长中"}</span></div>
  </div>;
}
