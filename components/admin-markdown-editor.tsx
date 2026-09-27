'use client';
import { lazy, Suspense, type ComponentProps } from 'react';

const Editor = lazy(() => import('./admin-markdown-editor-content'));

export function AdminMarkdownEditor(props: ComponentProps<typeof Editor>) {
  return (
    <Suspense fallback={<output className="admin-wide">编辑器加载中…</output>}>
      <Editor {...props} />
    </Suspense>
  );
}
