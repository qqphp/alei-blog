import { notFound } from 'next/navigation';
import { AdminGranularPanel } from '@/components/admin-granular-panel';
import { serverConfig } from '@/lib/server-config';
import '@/components/admin.css';

export const metadata = {
  title: '内容管理 · 开发阿雷',
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  params,
}: {
  params: Promise<{ adminPath: string }>;
}) {
  const { adminPath } = await params;
  const configuredPath = serverConfig().ADMIN_PATH;
  if (!configuredPath || !/^[a-f0-9]{48}$/.test(configuredPath) || adminPath !== configuredPath)
    notFound();
  return <AdminGranularPanel />;
}
