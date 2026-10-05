import { EnvHttpProxyAgent, type Dispatcher } from 'undici';

let proxy: Dispatcher | undefined;
let proxyEnvironment = '';

export function serverFetch(url: string | URL, init: RequestInit = {}) {
  const environment = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
  ]
    .map((key) => process.env[key] || '')
    .join('\n');
  if (environment !== proxyEnvironment) {
    void proxy?.close();
    proxyEnvironment = environment;
    proxy = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].some(
      (key) => process.env[key],
    )
      ? new EnvHttpProxyAgent()
      : undefined;
  }
  const options: RequestInit & { dispatcher?: Dispatcher } = {
    ...init,
    dispatcher: proxy,
  };
  return fetch(url, options);
}
