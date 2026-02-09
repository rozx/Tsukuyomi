export interface HelpNavigationDocument {
  id: string;
  file: string;
}

export function resolveHelpDocumentByHref<T extends HelpNavigationDocument>(
  documents: T[],
  href: string,
): T | null {
  const [rawPath] = href.split('#', 1);
  const pathWithoutQuery = (rawPath || '').split('?', 1)[0] || '';
  const normalizedPath = pathWithoutQuery
    .replace(/^(?:\.\/|\.\.\/)+/, '')
    .replace(/^\/+/, '');

  const fileName = normalizedPath.split('/').pop() || normalizedPath;
  const docId = fileName.replace(/\.md$/i, '');

  return (
    documents.find(
      (doc) => doc.id === docId || doc.file === normalizedPath || doc.file === fileName,
    ) ?? null
  );
}
