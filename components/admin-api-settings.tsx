'use client';

import { useEffect, useState } from 'react';
import { api } from './admin-fields';

type ApiStatus = {
  configured: boolean;
  source: 'admin' | 'environment' | 'missing';
};

type ApiSettingsResponse = {
  artificialAnalysis: ApiStatus;
};

function statusText(status: ApiStatus | null) {
  if (!status) return '正在读取配置状态…';
  if (status.source === 'admin') return '后台密钥已配置';
  if (status.source === 'environment') return 'AA_API_KEY 环境变量已配置';
  return '尚未配置密钥';
}

export function AdminApiSettings() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let mounted = true;
    void api<ApiSettingsResponse>('/api/admin/api-settings')
      .then((result) => {
        if (mounted) setStatus(result.artificialAnalysis);
      })
      .catch(() => {
        if (mounted) setMessage('无法读取接口配置，请重新登录。');
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function save() {
    setWorking(true);
    setMessage('');
    try {
      const result = await api<ApiSettingsResponse>('/api/admin/api-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      setStatus(result.artificialAnalysis);
      setApiKey('');
      setMessage('密钥已保存，不会在页面中回显。');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking(false);
    }
  }

  async function clearOverride() {
    setWorking(true);
    setMessage('');
    try {
      const result = await api<ApiSettingsResponse>('/api/admin/api-settings', {
        method: 'DELETE',
      });
      setStatus(result.artificialAnalysis);
      setMessage(
        result.artificialAnalysis.source === 'environment'
          ? '后台密钥已清除，当前使用 AA_API_KEY 环境变量。'
          : '后台密钥已清除。',
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="admin-api-settings" aria-labelledby="admin-aa-title">
      <div className="admin-ai-status">
        <strong id="admin-aa-title">Artificial Analysis</strong>
        <span>{statusText(status)}</span>
      </div>
      <p>
        用于前台“大模型数据”栏目。后台密钥优先于 .dev.vars 中的 AA_API_KEY；密钥仅写入，读取接口只返回配置状态。
      </p>
      <div className="admin-fields">
        <div className="admin-field admin-wide">
          <label htmlFor="aa-api-key">API 密钥</label>
          <input
            id="aa-api-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            placeholder={
              status?.source === 'admin'
                ? '后台密钥已保存；输入新密钥可替换'
                : '粘贴 Artificial Analysis API 密钥'
            }
            spellCheck={false}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <small>
            请求由服务端发送，密钥不会写入公开页面或状态读取响应；完整数据库备份包含密钥，请妥善保管。
          </small>
        </div>
        <div className="admin-ai-checks admin-wide">
          <button
            type="button"
            disabled={working || !apiKey.trim()}
            onClick={() => void save()}
          >
            {working ? '保存中…' : '保存密钥'}
          </button>
          {status?.source === 'admin' && (
            <button
              type="button"
              disabled={working}
              onClick={() => void clearOverride()}
            >
              清除后台密钥
            </button>
          )}
          <output aria-live="polite">{message}</output>
        </div>
      </div>
    </section>
  );
}
