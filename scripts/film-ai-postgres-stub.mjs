export async function withDatabase(run) {
  const settingsRow = await globalThis.__filmTestSettings();
  const client = {
    async query(sql) {
      if (String(sql).includes('FROM cms_sections') && settingsRow) {
        return {
          rows: [{
            section: 'aiSettings',
            value: settingsRow.value,
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

export const withReadDatabase = withDatabase;
