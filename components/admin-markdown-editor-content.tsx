'use client';
import { useState } from 'react';
import MDEditor from '@uiw/react-md-editor/nohighlight';
import rehypeSanitize from 'rehype-sanitize';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

export default function AdminMarkdownEditorContent({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [preview, setPreview] = useState<'edit' | 'live' | 'preview'>('live');
  return (
    <div className="admin-wide article-markdown" data-color-mode="light">
      <div className="admin-markdown-heading">
        <h3>{label}</h3>
        <div className="admin-markdown-modes">
          {(
            [
              ['edit', '编辑'],
              ['live', '分屏'],
              ['preview', '预览'],
            ] as const
          ).map(([mode, text]) => (
            <button
              type="button"
              key={mode}
              aria-pressed={preview === mode}
              onClick={() => setPreview(mode)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? '')}
        preview={preview}
        extraCommands={[]}
        height={520}
        visibleDragbar={false}
        previewOptions={{ rehypePlugins: [rehypeSanitize], skipHtml: true }}
        textareaProps={{
          'aria-label': `${label} Markdown`,
          placeholder: '开始写作，支持 Markdown 格式…',
        }}
      />
    </div>
  );
}
