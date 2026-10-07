'use client';
import { useEffect, useState } from 'react';
import type { Content } from '@/lib/cms-defaults';
import { Tabs } from '@base-ui/react/tabs';
import { AdminModelSelect } from './admin-model-select';
import { api } from './admin-fields';
import { AdminApiSettings } from './admin-api-settings';

type AiSettings = Content['aiSettings'];
type ImageSizeField =
  | 'coverSize'
  | 'projectImageSize'
  | 'storyImageSize'
  | 'playlistCoverSize'
  | 'filmCoverSize'
  | 'podcastCoverSize'
  | 'travelCoverSize'
  | 'hobbyCoverSize'
  | 'bookCoverSize'
  | 'booklistCoverSize';

function ImageSizeSetting({
  id,
  label,
  field,
  value,
  onChange,
}: {
  id: string;
  label: string;
  field: ImageSizeField;
  value: AiSettings;
  onChange: (value: AiSettings) => void;
}) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value[field]}
        inputMode="text"
        pattern="(?:auto|[0-9]+x[0-9]+)"
        spellCheck={false}
        onChange={(event) =>
          onChange({ ...value, [field]: event.target.value })
        }
      />
      <small>
        填写 auto 或像素尺寸，如 1536x1024。宽高须为 16 的倍数，最大边不超过
        3840，比例不超过 3:1，总像素数为 655,360–8,294,400。
      </small>
    </div>
  );
}

export function AdminAiSettings({
  value,
  onChange,
  dirty,
}: {
  value: Content['aiSettings'];
  onChange: (value: Content['aiSettings']) => void;
  dirty: boolean;
}) {
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => {
    void api<{ keyConfigured: boolean }>('/api/admin/ai')
      .then((result) => setKeyConfigured(result.keyConfigured))
      .catch(() => setMessage('无法读取密钥状态，请重新登录。'));
  }, []);
  async function check(action: 'models' | 'test') {
    setWorking(true);
    setMessage('正在连接 AI 服务…');
    try {
      const result = await api<{ models?: string[]; message?: string }>(
        '/api/admin/ai',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      if (result.models) setModels(result.models);
      setMessage(
        result.message ||
          `连接成功，获取到 ${result.models?.length ?? 0} 个模型。`,
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking(false);
    }
  }
  return (
    <Tabs.Root defaultValue="models" className="admin-ai-settings">
      <Tabs.List className="admin-settings-tabs" aria-label="AI 功能配置">
        <Tabs.Tab value="models">模型配置</Tabs.Tab>
        <Tabs.Tab value="api">API 接口设置</Tabs.Tab>
        <Tabs.Tab value="markdown">Markdown 内容</Tabs.Tab>
        <Tabs.Tab value="writing">写作配置</Tabs.Tab>
        <Tabs.Tab value="projects">项目配置</Tabs.Tab>
        <Tabs.Tab value="stories">说说配置</Tabs.Tab>
        <Tabs.Tab value="music">歌单配置</Tabs.Tab>
        <Tabs.Tab value="films">电影配置</Tabs.Tab>
        <Tabs.Tab value="podcasts">播客配置</Tabs.Tab>
        <Tabs.Tab value="travel">旅行配置</Tabs.Tab>
        <Tabs.Tab value="hobby">爱好配置</Tabs.Tab>
        <Tabs.Tab value="book">书籍配置</Tabs.Tab>
        <Tabs.Tab value="booklist">书单配置</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="models">
        <div className="admin-ai-status">
          <strong>OpenAI 兼容接口</strong>
          <span>
            {keyConfigured === null
              ? '正在读取密钥状态…'
              : keyConfigured
                ? 'AI_PROVIDER_API_KEY 已配置'
                : 'AI_PROVIDER_API_KEY 未配置'}
          </span>
        </div>
        <p>
          密钥从服务端 .env
          读取，不会显示在后台或内容备份中。更改密钥后需要重启服务。
        </p>
        <div className="admin-fields">
          <div className="admin-field admin-wide">
            <label htmlFor="ai-base-url">API Base URL</label>
            <input
              id="ai-base-url"
              value={value.baseUrl}
              onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            />
            <small>
              填写包含 /v1 的接口根地址。更换 AI 服务时，请同时更新
              AI_PROVIDER_API_KEY；密钥会发给这里配置的站点。
            </small>
          </div>
          {(
            [
              ['textModel', '文本模型'],
              ['imageModel', '图片模型'],
            ] as const
          ).map(([key, label]) => (
            <div className="admin-field" key={key}>
              <label htmlFor={`ai-${key}`}>{label}</label>
              <AdminModelSelect
                id={`ai-${key}`}
                label={label}
                value={value[key]}
                models={models}
                onChange={(model) => onChange({ ...value, [key]: model })}
              />
            </div>
          ))}
          <div className="admin-ai-checks admin-wide">
            <button
              type="button"
              disabled={working || dirty || !keyConfigured}
              onClick={() => void check('models')}
            >
              获取模型列表
            </button>
            <button
              type="button"
              disabled={working || dirty || !keyConfigured}
              onClick={() => void check('test')}
            >
              测试文本模型
            </button>
            <small>
              {dirty
                ? '请先保存设置，再测试连接。'
                : '模型列表用于验证连接，文本测试会发送一次简短请求。'}
            </small>
            <output>{message}</output>
          </div>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="api">
        <AdminApiSettings />
      </Tabs.Panel>
      <Tabs.Panel value="markdown">
        <div className="admin-section-heading"><div>
          <h2>Markdown 内容设置</h2>
          <p className="admin-help">适用于所有 Markdown 编辑器，使用“模型配置”中已保存的文本模型。单次最多 12,000 个字符，全文发送到配置的 AI 服务。</p>
        </div></div>
        <div className="admin-fields">
          {([
            ['markdownDiagnosePrompt', '诊断提示词', '检查语法、标点、冗长句和通顺程度，诊断不会修改正文。'],
            ['markdownRepairPrompt', '修复提示词', '依据诊断结果生成完整修订稿，查看差异后应用。'],
            ['markdownPolishPrompt', '文本润色提示词', '参考 Humanizer-zh 的编辑原则，保留事实、作者声音和文体。'],
          ] as const).map(([field, label, help]) => <div className="admin-field admin-wide" key={field}>
            <label htmlFor={`ai-${field}`}>{label}</label>
            <textarea id={`ai-${field}`} rows={8} value={value[field]}
              onChange={(event) => onChange({ ...value, [field]: event.target.value })} />
            <small>{help} 系统会补充输出格式和 Markdown 保护要求，无需填写内容占位符。</small>
          </div>)}
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="writing">
        <div className="admin-section-heading">
          <div>
            <h2>文章封面生成</h2>
            <p className="admin-help">
              根据标题、摘要和以下风格生成封面。模型在“模型配置”中选择。
            </p>
          </div>
        </div>
        <div className="admin-fields">
          <ImageSizeSetting
            id="ai-cover-size"
            label="文章封面尺寸"
            field="coverSize"
            value={value}
            onChange={onChange}
          />
          <div className="admin-field admin-wide">
            <label htmlFor="ai-cover-style">文章封面风格</label>
            <textarea
              id="ai-cover-style"
              rows={3}
              value={value.coverStyle}
              onChange={(e) =>
                onChange({ ...value, coverStyle: e.target.value })
              }
            />
          </div>
          <div className="admin-field admin-wide">
            <label htmlFor="ai-cover-prompt">文章封面图片生成提示词</label>
            <textarea
              id="ai-cover-prompt"
              rows={11}
              value={value.coverPrompt}
              onChange={(e) =>
                onChange({ ...value, coverPrompt: e.target.value })
              }
            />
            <small>
              {
                '{{description}} = 当前封面的图片描述；{{style}} = 上方封面风格。图片描述占位符必须保留。'
              }
            </small>
          </div>
        </div>
        <p>
          封面通过 /images/generations 生成，支持返回 Base64 图片或 HTTPS
          图片地址。生成结果会以质量 80 转为 WebP 并存入本地素材库；失败不替换原封面，也不自动重试。
        </p>
      </Tabs.Panel>
      <Tabs.Panel value="projects">
        <div className="admin-section-heading">
          <div>
            <h2>项目图片生成</h2>
            <p className="admin-help">
              使用“模型配置”中的图片模型，根据每张项目图片的图片描述生成配图。
            </p>
          </div>
        </div>
        <div className="admin-fields">
          <ImageSizeSetting
            id="ai-project-size"
            label="项目图片尺寸"
            field="projectImageSize"
            value={value}
            onChange={onChange}
          />
          <div className="admin-field admin-wide">
            <label htmlFor="ai-project-style">项目图片风格</label>
            <textarea
              id="ai-project-style"
              rows={3}
              value={value.projectImageStyle}
              onChange={(e) =>
                onChange({ ...value, projectImageStyle: e.target.value })
              }
            />
          </div>
          <div className="admin-field admin-wide">
            <label htmlFor="ai-project-prompt">项目图片生成提示词</label>
            <textarea
              id="ai-project-prompt"
              rows={11}
              value={value.projectImagePrompt}
              onChange={(e) =>
                onChange({ ...value, projectImagePrompt: e.target.value })
              }
            />
            <small>
              {
                '{{description}} = 当前图片的图片描述；{{style}} = 图片风格。图片描述占位符必须保留。'
              }
            </small>
          </div>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="stories">
        <div className="admin-section-heading">
          <div>
            <h2>说说图片生成</h2>
            <p className="admin-help">
              使用“模型配置”中的图片模型，根据每张图片的图片描述生成合适的配图。
            </p>
          </div>
        </div>
        <div className="admin-fields">
          <ImageSizeSetting
            id="ai-story-size"
            label="说说图片尺寸"
            field="storyImageSize"
            value={value}
            onChange={onChange}
          />
          <div className="admin-field admin-wide">
            <label htmlFor="ai-story-style">说说图片风格</label>
            <textarea
              id="ai-story-style"
              rows={3}
              value={value.storyImageStyle}
              onChange={(event) =>
                onChange({ ...value, storyImageStyle: event.target.value })
              }
            />
          </div>
          <div className="admin-field admin-wide">
            <label htmlFor="ai-story-prompt">说说图片生成提示词</label>
            <textarea
              id="ai-story-prompt"
              rows={9}
              value={value.storyImagePrompt}
              onChange={(event) =>
                onChange({ ...value, storyImagePrompt: event.target.value })
              }
            />
            <small>
              {
                '{{description}} = 当前图片的图片描述；{{style}} = 图片风格。图片描述占位符必须保留。'
              }
            </small>
          </div>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="music">
        <h2>歌单封面生成</h2>
        <p className="admin-help">
          使用图片模型，根据歌单封面的图片描述生成配图。请先保存配置。
        </p>
        <div className="admin-fields">
          <ImageSizeSetting
            id="playlist-cover-size"
            label="歌单封面尺寸"
            field="playlistCoverSize"
            value={value}
            onChange={onChange}
          />
          <div className="admin-field admin-wide">
            <label htmlFor="playlist-cover-style">歌单封面风格</label>
            <textarea
              id="playlist-cover-style"
              rows={3}
              value={value.playlistCoverStyle}
              onChange={(event) =>
                onChange({ ...value, playlistCoverStyle: event.target.value })
              }
            />
          </div>
          <div className="admin-field admin-wide">
            <label htmlFor="playlist-cover-prompt">歌单封面提示词</label>
            <textarea
              id="playlist-cover-prompt"
              rows={9}
              value={value.playlistCoverPrompt}
              onChange={(event) =>
                onChange({ ...value, playlistCoverPrompt: event.target.value })
              }
            />
            <small>
              {
                '{{description}} = 图片描述；{{style}} = 封面风格。图片描述占位符必须保留。'
              }
            </small>
          </div>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="films">
        <h2>电影封面生成</h2>
        <p className="admin-help">
          使用“模型配置”中的图片模型，根据电影封面的图片描述生成配图。请先保存配置。
        </p>
        <div className="admin-fields">
          <ImageSizeSetting
            id="film-cover-size"
            label="电影封面尺寸"
            field="filmCoverSize"
            value={value}
            onChange={onChange}
          />
          <div className="admin-field admin-wide">
            <label htmlFor="film-cover-style">电影封面风格</label>
            <textarea
              id="film-cover-style"
              rows={3}
              value={value.filmCoverStyle}
              onChange={(event) =>
                onChange({ ...value, filmCoverStyle: event.target.value })
              }
            />
          </div>
          <div className="admin-field admin-wide">
            <label htmlFor="film-cover-prompt">电影封面提示词</label>
            <textarea
              id="film-cover-prompt"
              rows={9}
              value={value.filmCoverPrompt}
              onChange={(event) =>
                onChange({ ...value, filmCoverPrompt: event.target.value })
              }
            />
            <small>
              {
                '{{description}} = 图片描述；{{style}} = 封面风格。图片描述占位符必须保留。'
              }
            </small>
          </div>
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="podcasts">
        <h2>播客封面生成</h2>
        <p className="admin-help">
          使用“模型配置”中的图片模型，根据播客封面的图片描述生成配图。请先保存配置。
        </p>
        <div className="admin-fields">
          <ImageSizeSetting
            id="podcast-cover-size"
            label="播客封面尺寸"
            field="podcastCoverSize"
            value={value}
            onChange={onChange}
          />
          <div className="admin-field admin-wide">
            <label htmlFor="podcast-cover-style">播客封面风格</label>
            <textarea
              id="podcast-cover-style"
              rows={3}
              value={value.podcastCoverStyle}
              onChange={(event) =>
                onChange({ ...value, podcastCoverStyle: event.target.value })
              }
            />
          </div>
          <div className="admin-field admin-wide">
            <label htmlFor="podcast-cover-prompt">播客封面提示词</label>
            <textarea
              id="podcast-cover-prompt"
              rows={9}
              value={value.podcastCoverPrompt}
              onChange={(event) =>
                onChange({ ...value, podcastCoverPrompt: event.target.value })
              }
            />
            <small>
              {
                '{{description}} = 图片描述；{{style}} = 封面风格。图片描述占位符必须保留。'
              }
            </small>
          </div>
        </div>
      </Tabs.Panel>
      {(['travel', 'hobby', 'book', 'booklist'] as const).map((kind) => {
        const label = {
          travel: '旅行',
          hobby: '爱好',
          book: '书籍',
          booklist: '书单',
        }[kind];
        return (
          <Tabs.Panel value={kind} key={kind}>
            <div className="admin-fields">
              <ImageSizeSetting
                id={`${kind}-cover-size`}
                label={`${label}封面尺寸`}
                field={`${kind}CoverSize`}
                value={value}
                onChange={onChange}
              />
              <div className="admin-field admin-wide">
                <label htmlFor={`${kind}-cover-style`}>{label}封面风格</label>
                <textarea
                  id={`${kind}-cover-style`}
                  rows={3}
                  value={value[`${kind}CoverStyle`]}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [`${kind}CoverStyle`]: event.target.value,
                    })
                  }
                />
              </div>
              <div className="admin-field admin-wide">
                <label htmlFor={`${kind}-cover-prompt`}>
                  {label}封面提示词
                </label>
                <textarea
                  id={`${kind}-cover-prompt`}
                  rows={4}
                  value={value[`${kind}CoverPrompt`]}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [`${kind}CoverPrompt`]: event.target.value,
                    })
                  }
                />
                <small>
                  {'{{description}} = 图片描述；{{style}} = 风格。图片描述占位符必须保留。'}
                  保存配置后，点击编辑页面的 AI 生成配图按钮生效。
                </small>
              </div>
            </div>
          </Tabs.Panel>
        );
      })}
    </Tabs.Root>
  );
}
