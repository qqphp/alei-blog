/** @param {Record<string, unknown>} value */
export function recordFields(value) {
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
    occurredAt: Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null,
    search: [...text, ...paragraphs].join(' '),
  };
}
