export function PublicListError({ error }: { error: string }) {
  return error ? <p role="alert">{error}</p> : null;
}
