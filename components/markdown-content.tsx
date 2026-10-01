import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/contrib/mhchem';
import { Children, isValidElement } from 'react';
import './markdown-content.css';

export function MarkdownContent({ source }: { source: string }) {
  return (
    <div className="markdown-body site-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
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
