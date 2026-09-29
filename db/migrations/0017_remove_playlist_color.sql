UPDATE cms_entries
SET payload = payload - 'color',
    revision = revision + 1,
    updated_at = now()
WHERE section = 'tracks' AND collection = 'playlists' AND payload ? 'color';
