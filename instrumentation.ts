export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge' || process.env.CONTACT_MAIL_WORKER_ENABLED === '0') return;
  const state = globalThis as typeof globalThis & { contactMailTimer?: ReturnType<typeof setInterval> };
  if (state.contactMailTimer) return;
  const { processContactNotifications } = await import('./lib/contact-service');
  let running = false;
  state.contactMailTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await processContactNotifications(); }
    catch { console.error('留言通知任务暂时无法运行，请检查数据库及邮箱配置。'); }
    finally { running = false; }
  }, 5000);
  state.contactMailTimer.unref();
}
