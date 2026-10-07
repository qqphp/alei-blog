import ipaddr from 'ipaddr.js';

export function seoEnvironment(env = process.env) {
  const flag = env.SEO_INDEXABLE ?? '0';
  if (flag !== '0' && flag !== '1') throw new Error('SEO_INDEXABLE 必须为 0 或 1');
  const input = env.SITE_URL?.trim() ?? '';
  let siteUrl = '';
  if (input) {
    try {
      const url = new URL(input);
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      const ip = host.replace(/^\[|\]$/g, '');
      const localIp = ipaddr.isValid(ip) && ['loopback', 'unspecified'].includes(ipaddr.process(ip).range());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          url.pathname !== '/' || url.search || url.hash || !/^https?:\/\/[^/?#]+\/?$/i.test(input)) throw new Error();
      if (flag === '1' && (url.protocol !== 'https:' || host === 'localhost' ||
          host.endsWith('.localhost') || localIp)) throw new Error();
      siteUrl = url.origin;
    } catch {
      throw new Error('SITE_URL 必须为无账号密码、子路径、查询或片段的网站根地址；开启收录时必须使用非本地 HTTPS 地址');
    }
  }
  if (flag === '1' && !siteUrl) throw new Error('SEO_INDEXABLE=1 时必须填写正式 SITE_URL');
  return { siteUrl, indexable: flag === '1' };
}
