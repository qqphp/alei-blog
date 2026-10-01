let pending: Promise<void> | undefined;
let configured: typeof import('katex') | undefined;

function loadAsset(tag: 'script' | 'link', id: string, url: string) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const element = document.createElement(tag);
    if (element instanceof HTMLScriptElement) element.src = url;
    else { element.rel = 'stylesheet'; element.href = url; }
    element.onload = () => { element.id = id; resolve(); };
    element.onerror = () => { element.remove(); reject(new Error('公式资源加载失败，暂时显示公式源码；刷新页面后重试。')); };
    document.head.appendChild(element);
  });
}

export function loadVditorMath() {
  if (!pending) {
    pending = (async () => {
      await loadAsset('link', 'vditorKatexStyle', '/vendor/vditor/dist/js/katex/katex.min.css');
      await loadAsset('script', 'vditorKatexScript', '/vendor/vditor/dist/js/katex/katex.min.js');
      await loadAsset('script', 'vditorKatexChemScript', '/vendor/vditor/dist/js/katex/mhchem.min.js');
      const katex = (window as Window & { katex: typeof import('katex') }).katex;
      if (!katex?.renderToString) throw new Error('公式资源加载失败，暂时显示公式源码；刷新页面后重试。');
      if (katex !== configured) {
        const render = katex.renderToString;
        // Vditor inserts thrown error messages as HTML; let KaTeX produce escaped error markup instead.
        katex.renderToString = (source, options) => render(source, { ...options, trust: false, throwOnError: false });
        configured = katex;
      }
    })().finally(() => { pending = undefined; });
  }
  return pending;
}
