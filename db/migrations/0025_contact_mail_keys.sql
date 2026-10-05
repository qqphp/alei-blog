CREATE TABLE contact_mail_keys (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  key bytea NOT NULL CHECK (octet_length(key) = 32),
  created_at timestamptz NOT NULL DEFAULT now()
);
