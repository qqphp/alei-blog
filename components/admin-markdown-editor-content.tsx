'use client';
import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Vditor from 'vditor';
import { upload } from './admin-fields';
import { MarkdownContent } from './markdown-content';
import { loadVditorMath } from './vditor-math';
import { AdminMarkdownAssistant } from './admin-markdown-assistant';
import 'vditor/dist/index.css';

export default function AdminMarkdownEditorContent({
  label,
  value,
  onChange,
  onWorking,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onWorking?: (working: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<Vditor | null>(null);
  const callbacks = useRef({ onChange, onWorking });
  const currentValue = useRef(value);
  const generation = useRef(0);
  const [message, setMessage] = useState('');
  const [readyLabel, setReadyLabel] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const aiWorking = useRef(false);
  useEffect(() => { callbacks.current = { onChange, onWorking }; }, [onChange, onWorking]);

  useEffect(() => {
    let disposed = false;
    let ready = false;
    let uploads = 0;
    const updateCount = () => {
      if (!ready || disposed) return;
      // Count parsed text in every mode; Vditor's text counter reads an empty textarea in SV mode.
      const template = document.createElement('template');
      template.innerHTML = instance.vditor.lute.Md2HTML(instance.getValue());
      const length = (template.content.textContent ?? '').replace(/\n/g, '').length;
      const counter = container.current!.querySelector('.vditor-counter');
      if (counter) { counter.textContent = `${length} 字`; counter.setAttribute('aria-label', `正文 ${length} 字`); }
    };
    const syncInput = () => {
      if (!ready || disposed) return;
      const next = instance.getValue();
      if (next !== currentValue.current) {
        currentValue.current = next;
        callbacks.current.onChange(next);
      }
      updateCount();
    };
    const beforeToolbar = (event: Event) => {
      if ((event.target as Element).closest('.vditor-toolbar')) syncInput();
    };
    const beforeModeKey = (event: KeyboardEvent) => {
      if (event.altKey && (event.ctrlKey || event.metaKey) && ['7', '8', '9'].includes(event.key)) syncInput();
    };
    const fieldset = container.current!.closest('fieldset');
    const syncDisabled = () => {
      if (!ready || disposed || !fieldset) return;
      if (fieldset.disabled) instance.disabled();
      else instance.enable();
    };
    const observer = new MutationObserver(syncDisabled);
    if (fieldset) observer.observe(fieldset, { attributes: true, attributeFilter: ['disabled'] });
    const instance = new Vditor(container.current!, {
      lang: 'zh_CN', mode: 'ir', height: 520,
      cdn: '/vendor/vditor',
      cache: { enable: false },
      classes: { preview: 'site-markdown' },
      outline: { enable: true, position: 'left' },
      counter: { enable: true, type: 'text', after: updateCount },
      value: '',
      placeholder: '开始写作，支持 Markdown 格式…',
      toolbar: ['headings', 'bold', 'italic', 'strike', '|', 'list', 'ordered-list', 'check',
        'outdent', 'indent', '|',
        'quote', 'line', 'code', 'inline-code', 'link', 'upload', 'table', '|',
        'undo', 'redo', '|', 'outline', 'edit-mode', 'both', 'preview', 'fullscreen'],
      preview: {
        delay: 200,
        hljs: { enable: false },
        math: { engine: 'KaTeX', inlineDigit: true, macros: {} },
        markdown: { sanitize: true, codeBlockPreview: false, mathBlockPreview: false, callout: false },
        render: { media: { enable: false } },
        transform: () => {
          // Native outline discovery needs headings directly under its preview element.
          const template = document.createElement('template');
          template.innerHTML = renderToStaticMarkup(<MarkdownContent source={ready ? instance.getValue() : currentValue.current} />);
          return template.content.querySelector('.site-markdown')!.innerHTML;
        },
      },
      input: (next) => {
        if (!ready || disposed) return;
        currentValue.current = next;
        callbacks.current.onChange(next);
      },
      after: async () => {
        if (disposed) return;
        // Vditor's bundled Lute exposes this setter, but its declarations omit it.
        const lute = instance.vditor.lute as typeof instance.vditor.lute & { SetInlineMath(enabled: boolean): void };
        lute.SetInlineMath(false);
        instance.disabled();
        try {
          await loadVditorMath();
          if (disposed) return;
          lute.SetInlineMath(true);
          lute.SetVditorMathBlockPreview(true);
          instance.vditor.options.preview!.markdown!.mathBlockPreview = true;
        } catch (error) {
          if (disposed) return;
          setMessage((error as Error).message);
        }
        ready = true;
        editor.current = instance;
        setReadyLabel(label);
        instance.vditor.preview!.previewElement.classList.add('markdown-body');
        instance.setValue(currentValue.current, true);
        instance.enable();
        syncDisabled();
        updateCount();
        for (const element of container.current!.querySelectorAll('[contenteditable="true"], textarea')) {
          element.setAttribute('role', 'textbox');
          element.setAttribute('aria-label', `${label} Markdown`);
          element.setAttribute('aria-multiline', 'true');
        }
      },
      upload: {
        accept: '', multiple: true,
        handler: async (files) => {
          if (aiWorking.current) { setMessage('请等待 AI 处理完成后再上传文件。'); return null; }
          const uploadGeneration = generation.current;
          uploads++;
          setUploading(true);
          callbacks.current.onWorking?.(true);
          setMessage('正在上传正文图片或文件…');
          try {
            for (const file of files) {
              const result = await upload(file);
              if (disposed || uploadGeneration !== generation.current) return null;
              const alt = file.name.replace(/[[\]\\\r\n]/g, '');
              const url = result.url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
              instance.insertMD(`\n${file.type.startsWith('image/') ? '!' : ''}[${alt}](${url})\n\n`);
              currentValue.current = instance.getValue();
              callbacks.current.onChange(currentValue.current);
            }
            setMessage('正文图片或文件已上传，确认提交后保存。');
          } catch (error) {
            if (!disposed && uploadGeneration === generation.current) setMessage(error instanceof Error ? error.message : '文件上传失败，请重试');
          } finally {
            uploads--;
            if (!disposed && uploads === 0) setUploading(false);
            if (!disposed && uploads === 0) callbacks.current.onWorking?.(false);
          }
          return null;
        },
      },
    });
    const root = container.current!;
    root.addEventListener('click', beforeToolbar, true);
    root.addEventListener('keydown', beforeModeKey, true);
    root.addEventListener('focusout', syncInput);
    return () => {
      disposed = true;
      observer.disconnect();
      root.removeEventListener('click', beforeToolbar, true);
      root.removeEventListener('keydown', beforeModeKey, true);
      root.removeEventListener('focusout', syncInput);
      editor.current = null;
      instance.destroy();
      if (uploads > 0) callbacks.current.onWorking?.(false);
    };
  }, [label]);

  useEffect(() => {
    if (value === currentValue.current) return;
    generation.current++;
    currentValue.current = value;
    if (editor.current?.vditor?.lute) editor.current.setValue(value, true);
  }, [value]);

  return (
    <AdminMarkdownAssistant label={label} value={value} disabled={readyLabel !== label || uploading}
      readMarkdown={() => editor.current?.getValue() ?? currentValue.current}
      onWorking={(working) => { aiWorking.current = working; callbacks.current.onWorking?.(working); }}
      applyMarkdown={(markdown) => {
        currentValue.current = markdown;
        editor.current?.setValue(markdown);
        callbacks.current.onChange(markdown);
      }}>
      <div ref={container} />
      <output aria-live="polite">{message}</output>
    </AdminMarkdownAssistant>
  );
}
