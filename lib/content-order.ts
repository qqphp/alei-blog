function timestamp(value: string) {
  return Date.parse(value) || 0;
}

export function newestArticlesFirst<T extends { date: string }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      timestamp(b.date.replaceAll('.', '-')) -
      timestamp(a.date.replaceAll('.', '-')),
  );
}

export function newestProjectsFirst<
  T extends { createdAt: string },
>(items: T[]) {
  return [...items].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
}
