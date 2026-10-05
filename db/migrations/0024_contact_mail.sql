CREATE TABLE contact_mail_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  value jsonb NOT NULL,
  secret text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1
);
CREATE TABLE contact_codes (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','sent','failed','superseded','consumed','locked')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz,
  failures integer NOT NULL DEFAULT 0
);
CREATE INDEX contact_codes_email_time ON contact_codes (email, created_at DESC);
CREATE TABLE contact_messages (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  content text NOT NULL,
  recipient text NOT NULL,
  message_id text NOT NULL,
  created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','retry','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  lease_until timestamptz,
  lease_token uuid,
  last_error text NOT NULL DEFAULT ''
);
CREATE INDEX contact_messages_email_time ON contact_messages (email, created_at DESC);
CREATE INDEX contact_messages_queue ON contact_messages (next_attempt_at) WHERE status IN ('pending','retry','sending');
CREATE TABLE contact_limits (
  bucket text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
UPDATE cms_sections SET value = jsonb_build_object(
  'followTitle', '关注我的记录，也欢迎一起交流。',
  'followDescription', '关注公众号获取更新，或扫码加入交流群，聊聊开发、工具与日常探索。',
  'communityName', '', 'communityDescription', '', 'communityQr', ''
) || value, revision = revision + 1 WHERE section = 'profile'
  AND NOT (value ?& ARRAY['followTitle','followDescription','communityName','communityDescription','communityQr']);
