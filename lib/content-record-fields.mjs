/** @param {Record<string, unknown>} value @param {string} [section] */
export function recordFields(value, section) {
  const text = ['title', 'name', 'description', 'excerpt', 'text', 'summary', 'author', 'artist', 'tag', 'body']
    .map((key) => typeof value[key] === 'string' ? value[key] : '');
  const paragraphs = Array.isArray(value.paragraphs)
    ? value.paragraphs.filter((item) => typeof item === 'string') : [];
  const date = typeof value.date === 'string' && Number.isFinite(Date.parse(value.date)) ? value.date
    : typeof value.createdAt === 'string' ? value.createdAt : '';
  return {
    published: value._published === true,
    title: typeof value.title === 'string' ? value.title : typeof value.name === 'string' ? value.name : '',
    categoryId: typeof value.categoryId === 'string' ? value.categoryId
      : typeof value.moodId === 'string' ? value.moodId
        : typeof value.sectionId === 'string' ? value.sectionId : null,
    statusId: typeof value.statusId === 'string' ? value.statusId : null,
    occurredAt: section !== 'projects' && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null,
    search: [...text, ...paragraphs].join(' '),
  };
}

/** @param {Record<string, unknown>} value @param {string} section @param {string} collection */
export function recordPayload(value, section, collection) {
  if (section === 'projects' && collection === 'items') {
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...project } = value;
    return project;
  }
  return value;
}
