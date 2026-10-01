import { importFailure, importError } from './import-error';
import type { ImportNotice } from 'src/models/import-feedback';

import { load } from 'cheerio';
import type {
  ImportDraft,
  ImportMetadataValue,
  ImportResource,
  ImportSource,
} from 'src/models/import';

function imageUrl(value: string, base?: string): string {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    throw importError('INVALID_COVER', 'invalidCoverCoversRequireAnHTTPSImage', {});
  }
}

function observedImage(source: ImportSource, resource: ImportResource, value: string): boolean {
  if (resource.kind !== 'snapshot') return false;
  const base = resource.responseUrl ?? source.url;
  const urls: string[] = [];
  if (resource.inspection?.metadata.cover) urls.push(resource.inspection.metadata.cover);
  const $ = load(resource.text ?? '');
  $(
    'img[src], image[href], image[xlink\\:href], meta[property="og:image"], link[rel="image_src"]',
  ).each((_, element) => {
    const node = $(element);
    const candidate =
      node.attr('src') ?? node.attr('href') ?? node.attr('xlink:href') ?? node.attr('content');
    if (candidate) urls.push(candidate);
  });
  return urls.some((url) => {
    try {
      return imageUrl(url, base) === value;
    } catch {
      return false;
    }
  });
}

function coverValue(
  value: string,
  actor: 'user' | 'agent',
  source?: ImportSource,
  resource?: ImportResource,
): string {
  if (resource?.kind === 'input') {
    if (!resource.blob.type.startsWith('image/'))
      throw importError('INVALID_COVER', 'invalidCoverTheSpecifiedResourceIsNotAn', {});
    return `resource:${resource.id}`;
  }
  const url = imageUrl(value);
  if (actor === 'agent' && (!source || !resource || !observedImage(source, resource, url)))
    throw importError('INVALID_COVER', 'invalidCoverTheImageURLWasNotObserved', {});
  return url;
}

function metadataConflicts(
  draft: ImportDraft,
  field: keyof ImportDraft['metadata'],
  value: string,
  metadata?: Record<string, string>,
): ImportNotice[] {
  const selected = draft.novelScope.candidates.find(
    (candidate) => candidate.id === draft.novelScope.selectedCandidateId,
  );
  const conflicts: ImportNotice[] = [];
  if (selected && metadata?.title && metadata.title !== selected.title)
    conflicts.push(
      importFailure('METADATA_TITLE_CONFLICT', 'metadataTitleConflict', { title: metadata.title }),
    );
  if (selected?.author && metadata?.author && metadata.author !== selected.author)
    conflicts.push(
      importFailure('METADATA_AUTHOR_CONFLICT', 'metadataAuthorConflict', {
        author: metadata.author,
      }),
    );
  if (field === 'author' && selected?.author && value !== selected.author)
    conflicts.push(importFailure('METADATA_AUTHOR_CHOICE', 'metadataCandidateAuthor'));
  return conflicts;
}

export function validateImportMetadata(
  draft: ImportDraft,
  field: keyof ImportDraft['metadata'],
  value: string,
  actor: 'user' | 'agent',
  source?: ImportSource,
  resource?: ImportResource,
): { value: ImportMetadataValue; conflicts: ImportNotice[] } {
  const limit =
    field === 'description'
      ? 20000
      : field === 'alternateTitles' || field === 'tags'
        ? 5000
        : field === 'cover'
          ? 10000
          : 500;
  if (value.length > limit)
    throw importError('METADATA_LIMIT', 'metadataLimitMetadataExceedsTheFieldLengthLimit', {});
  if (
    resource &&
    (!source || (resource.sourceId !== source.id && source.inputResourceId !== resource.id))
  )
    throw importError('SOURCE_SCOPE', 'sourceScopeTheMetadataResourceBelongsToAnother', {});
  const content = field === 'cover' ? coverValue(value, actor, source, resource) : value;
  const metadata = resource?.kind === 'snapshot' ? resource.inspection?.metadata : undefined;
  const directEvidence = metadata?.[field] === value;
  const conflicts = metadataConflicts(draft, field, value, metadata);
  return {
    value: {
      value: content,
      origin:
        actor === 'user' ? 'user' : directEvidence || field === 'cover' ? 'source' : 'inferred',
      adopted: actor === 'user',
      ...(source ? { sourceId: source.id } : {}),
      ...(resource ? { resourceId: resource.id } : {}),
    },
    conflicts,
  };
}
