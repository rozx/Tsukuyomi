export interface HelpNavigationDocument {
  id: string;
  file: string;
}

export function resolveHelpDocumentByHref<T extends HelpNavigationDocument>(
  documents: T[],
  href: string,
): T | null {
  const normalized = href.replace(/^\.\//, '');
  const docId = normalized.replace(/\.md$/i, '');

  return documents.find((doc) => doc.id === docId || doc.file === normalized) ?? null;
}
