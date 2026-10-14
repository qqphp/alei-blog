import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/contrib/mhchem';
import { Children, isValidElement } from 'react';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import './markdown-content.css';

function remarkCurrencyRanges() {
  return (tree: Root, file: VFile) => {
    const source = String(file);
    visit(tree, 'inlineMath', (node, index, parent) => {
      if (index === undefined || !parent) return;
      const next = parent.children[index + 1];
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (typeof start !== 'number' || typeof end !== 'number') return;
      const value = source.slice(start, end);
      // In "$5 到 $10", the second currency symbol is parsed as a closing math delimiter.
      if (/^\$\d+(?:[.,]\d+)*\s*(?:到|至)\s*\$$/.test(value) &&
          next?.type === 'text' && /^\d/.test(next.value))
        parent.children[index] = { type: 'text', value, position: node.position };
    });
  };
}

export function MarkdownContent({ source }: { source: string }) {
  return (
    <div className="markdown-body site-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkCurrencyRanges]}
        rehypePlugins={[
          [rehypeSanitize, { ...defaultSchema, attributes: { ...defaultSchema.attributes,
            code: [['className', /^language-./, 'math-inline', 'math-display']],
          } }],
          [rehypeKatex, { trust: false }],
          [rehypeHighlight, { detect: false }],
        ]}
        skipHtml
        components={{
          h2: ({ node, children }) => (
            <h2 id={`heading-${node?.position?.start.line}`}>{children}</h2>
          ),
          code: ({ node: _node, className, children, ...attributes }) => (
            <code {...attributes} className={className?.split(' ').includes('hljs') && Children.toArray(children).some(isValidElement) ? className : undefined}>{children}</code>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
