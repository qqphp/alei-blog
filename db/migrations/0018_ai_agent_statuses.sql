INSERT INTO cms_entries (section, collection, id, position, title, payload, search_text)
VALUES
  ('ai', 'agentStatuses', 'active', 0, '已上线', '{"id":"active","name":"已上线"}'::jsonb, '已上线'),
  ('ai', 'agentStatuses', 'beta', 1, '公测中', '{"id":"beta","name":"公测中"}'::jsonb, '公测中'),
  ('ai', 'agentStatuses', 'coming', 2, '即将推出', '{"id":"coming","name":"即将推出"}'::jsonb, '即将推出')
ON CONFLICT (section, collection, id) DO NOTHING;
