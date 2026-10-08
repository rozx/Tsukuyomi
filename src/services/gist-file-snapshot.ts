import type { GistFileLike } from './gist-sync-incremental';
import { MANIFEST_FILE_NAME, parseNovelEntryKey } from 'src/models/manifest';
import { effectiveSchemaVersion, parseGistManifest } from 'src/utils/manifest-protocol';
import { LocalizedError } from 'src/utils/localized-error';

/** 旧布局分批迁移时保留原文件目录，正式 manifest 发布后删除。 */
export const LEGACY_FILE_INDEX_NAME = 'tsukuyomi-legacy-files.json';
export const LEGACY_FILE_INDEX_FORMAT = 'tsukuyomi-legacy-files-v1';

/** 仅用于修订展示；清单缺失、截断或无法确认时，不推断任何文件是遗留数据。 */
export function revisionSnapshotBookIds(
  files: Record<string, GistFileLike | null | undefined>,
): string[] | undefined {
  const file = files[MANIFEST_FILE_NAME];
  if (!file?.content || file.truncated) return undefined;
  try {
    const manifest = parseGistManifest(file.content);
    if (Object.values(manifest.entries).some((entry) => !entry || typeof entry.hash !== 'string'))
      return undefined;
    return Object.keys(manifest.entries)
      .map(parseNovelEntryKey)
      .filter((id): id is string => !!id);
  } catch {
    return undefined;
  }
}

interface GistSnapshot {
  files?: Record<string, GistFileLike | null | undefined>;
  history?: Array<{ version?: string }> | null;
  truncated?: boolean;
}

function incompleteSnapshot(): LocalizedError {
  return new LocalizedError('GIST_FILE_LIST_TRUNCATED', 'syncUi.incremental.gistTruncated');
}

function addPinnedFiles(files: Record<string, GistFileLike>, names: string[], root: string): void {
  for (const name of names) {
    files[name] = {
      ...(files[name] ?? { truncated: true }),
      raw_url: root + encodeURIComponent(name),
    };
  }
}

async function readLegacyFileIndex(
  root: string,
  files: Record<string, GistFileLike>,
): Promise<Record<string, GistFileLike>> {
  const response = await fetch(root + LEGACY_FILE_INDEX_NAME);
  if (!response.ok) throw incompleteSnapshot();
  const content = await response.text();
  let value: { format?: unknown; files?: unknown };
  try {
    value = JSON.parse(content) as typeof value;
  } catch {
    throw incompleteSnapshot();
  }
  if (
    !value ||
    value.format !== LEGACY_FILE_INDEX_FORMAT ||
    !Array.isArray(value.files) ||
    value.files.some(
      (name: unknown) =>
        typeof name !== 'string' ||
        !name ||
        /[/\\]/.test(name) ||
        name === '.' ||
        name === '..' ||
        name === MANIFEST_FILE_NAME ||
        name === LEGACY_FILE_INDEX_NAME,
    )
  )
    throw incompleteSnapshot();
  addPinnedFiles(files, value.files as string[], root);
  files[LEGACY_FILE_INDEX_NAME] = {
    content,
    truncated: false,
    raw_url: root + LEGACY_FILE_INDEX_NAME,
  };
  return files;
}

/** raw_url 中的修订可能是文件最后修改时间，必须替换成这次快照的修订。 */
function revisionRawRoot(
  gistId: string,
  revision: string,
  files: Record<string, GistFileLike>,
): string {
  if (!/^[a-f0-9]{40,64}$/i.test(revision)) throw incompleteSnapshot();
  for (const file of Object.values(files)) {
    if (!file.raw_url) continue;
    try {
      const url = new URL(file.raw_url);
      const [, owner, id, raw] = url.pathname.split('/');
      if (
        url.protocol === 'https:' &&
        url.hostname === 'gist.githubusercontent.com' &&
        !url.username &&
        !url.password &&
        owner &&
        id === gistId &&
        raw === 'raw'
      ) {
        return `https://gist.githubusercontent.com/${owner}/${id}/raw/${revision}/`;
      }
    } catch {
      /* 继续寻找同一 Gist 的有效原始文件地址。 */
    }
  }
  throw incompleteSnapshot();
}

/**
 * API 最多列出 300 个文件；用同一修订的权威清单补齐被省略的同步文件。
 * 清单缺失/损坏时停止，绝不把不完整列表当成完整书库。额外非同步文件保留原状。
 */
export async function completeGistFileSnapshot(
  gistId: string,
  data: GistSnapshot,
  filenamesForEntry: (key: string, chunks?: number, schemaVersion?: number) => string[],
  requestedRevision?: string,
): Promise<Record<string, GistFileLike>> {
  const files = Object.fromEntries(
    Object.entries(data.files ?? {}).filter(
      (entry): entry is [string, GistFileLike] => entry[1] != null,
    ),
  );
  if (!data.truncated) return files;
  const revision = requestedRevision ?? data.history?.[0]?.version;
  if (!revision) throw incompleteSnapshot();
  const root = revisionRawRoot(gistId, revision, files);
  const response = await fetch(root + MANIFEST_FILE_NAME);
  if (response.status === 404 && !files[MANIFEST_FILE_NAME])
    return readLegacyFileIndex(root, files);
  if (!response.ok) throw incompleteSnapshot();
  const content = await response.text();
  const manifest = parseGistManifest(content);
  const schema = effectiveSchemaVersion(manifest);
  files[MANIFEST_FILE_NAME] = { content, truncated: false, raw_url: root + MANIFEST_FILE_NAME };
  for (const [key, entry] of Object.entries(manifest.entries)) {
    if (
      !entry ||
      typeof entry.hash !== 'string' ||
      !Number.isSafeInteger(entry.chunks ?? 0) ||
      (entry.chunks ?? 0) < 0
    )
      throw incompleteSnapshot();
    const names = filenamesForEntry(key, entry.chunks, schema);
    if (!names.length) throw incompleteSnapshot();
    addPinnedFiles(files, names, root);
  }
  return files;
}
