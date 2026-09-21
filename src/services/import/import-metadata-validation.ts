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
    throw new Error('INVALID_COVER: 封面必须是 HTTP(S) 图片地址或当前任务中的图片资源');
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
      throw new Error('INVALID_COVER: 指定资源不是图片');
    return `resource:${resource.id}`;
  }
  const url = imageUrl(value);
  if (actor === 'agent' && (!source || !resource || !observedImage(source, resource, url)))
    throw new Error('INVALID_COVER: 来源中没有观察到该图片地址');
  return url;
}

function metadataConflicts(
  draft: ImportDraft,
  field: keyof ImportDraft['metadata'],
  value: string,
  metadata?: Record<string, string>,
): string[] {
  const selected = draft.novelScope.candidates.find(
    (candidate) => candidate.id === draft.novelScope.selectedCandidateId,
  );
  const conflicts: string[] = [];
  if (selected && metadata?.title && metadata.title !== selected.title)
    conflicts.push(`信息页书名“${metadata.title}”与所选小说不同，请检查版本。`);
  if (selected?.author && metadata?.author && metadata.author !== selected.author)
    conflicts.push(`信息页作者“${metadata.author}”与所选作者不同。`);
  if (field === 'author' && selected?.author && value !== selected.author)
    conflicts.push('候选作者不同于当前小说作者，需要用户决定。');
  return conflicts;
}

export function validateImportMetadata(
  draft: ImportDraft,
  field: keyof ImportDraft['metadata'],
  value: string,
  actor: 'user' | 'agent',
  source?: ImportSource,
  resource?: ImportResource,
): { value: ImportMetadataValue; conflicts: string[] } {
  const limit =
    field === 'description'
      ? 20000
      : field === 'alternateTitles'
        ? 5000
        : field === 'cover'
          ? 10000
          : 500;
  if (value.length > limit) throw new Error('METADATA_LIMIT: 元信息超过字段长度上限');
  if (
    resource &&
    (!source || (resource.sourceId !== source.id && source.inputResourceId !== resource.id))
  )
    throw new Error('SOURCE_SCOPE: 元信息资源不属于所声明来源');
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
