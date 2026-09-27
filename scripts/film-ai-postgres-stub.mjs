export async function withDatabase(run) {
  const saved = await globalThis.__filmTestBindings.DB.prepare().all();
  const settingsRow = saved.results.find((item) => item.key === 'aiSettings');
  const client = {
    async query(sql) {
      if (String(sql).includes('FROM cms_sections') && settingsRow) {
        return {
          rows: [{
            section: 'aiSettings',
            value: JSON.parse(settingsRow.value),
            revision: settingsRow.revision,
          }],
        };
      }
      return { rows: [] };
    },
  };
  return run(client);
}

export async function queryOne() {
  return null;
}
