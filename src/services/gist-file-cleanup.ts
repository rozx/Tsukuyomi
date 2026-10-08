import type { Octokit } from '@octokit/rest';
import { MANIFEST_FILE_NAME, type GistManifest } from 'src/models/manifest';
import { parseGistManifest } from 'src/utils/manifest-protocol';
import { LocalizedError } from 'src/utils/localized-error';
import { filenameToEntryKey } from './sync-manifest-builder';
import { filenamesForEntry, matchFilenamesInSnapshot } from './gist-sync-incremental';
import { completeGistFileSnapshot, revisionRawRoot } from './gist-file-snapshot';

export interface GistCleanupPlan {
  gistId: string;
  revision: string;
  partial: boolean;
  files: Array<{ filename: string; size?: number }>;
  totalBytes: number;
}

/** 先去掉分片序号/索引后缀，避免章节组末位十六进制与分片序号混淆。 */
function managedEntryKey(filename: string): string | null {
  const normalized = filename
    .replace(/^(chapters-chunk-.+)_[0-9]+\.json$/, '$1.json')
    .replace(/\.meta\.json$/, '.json');
  const key = filenameToEntryKey(normalized);
  return key && matchFilenamesInSnapshot(key, [filename]).length ? key : null;
}

function invalidManifest(): LocalizedError {
  return new LocalizedError('GIST_CLEANUP_INVALID_MANIFEST', 'syncUi.cleanup.invalidManifest');
}

function checkedFilenames(key: string, chunks?: number, schema?: number): string[] {
  // 拒绝损坏的计数，避免在完整列表重建之前分配无界数组。
  if (!Number.isSafeInteger(chunks ?? 0) || (chunks ?? 0) < 0 || (chunks ?? 0) > 10000)
    throw invalidManifest();
  const names = filenamesForEntry(key, chunks, schema);
  if (!names.length || names.some((name) => /[/\\]/.test(name))) throw invalidManifest();
  return names;
}

function protectedFilenames(manifest: GistManifest): Set<string> {
  if (manifest.pendingUpgradeFrom !== undefined)
    throw new LocalizedError('GIST_CLEANUP_UPGRADING', 'syncUi.cleanup.upgrading');
  const names = new Set([MANIFEST_FILE_NAME]);
  for (const [key, entry] of Object.entries(manifest.entries)) {
    if (!entry || typeof entry.hash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.hash))
      throw invalidManifest();
    for (const name of checkedFilenames(key, entry.chunks, manifest.schemaVersion)) names.add(name);
  }
  return names;
}

/** 读取器兼容三种分片分隔符，同一有效序号的旧别名也应保留。 */
function chunkAliases(name: string): string[] {
  if (!name.includes('-chunk-')) return [name];
  return [
    name,
    name.replace(/_(\d+)\.json$/, '#$1.json'),
    name.replace(/_(\d+)\.json$/, '-$1.json'),
  ];
}

/** 只读预览；清理范围由远端权威清单决定，与本地书库无关。 */
export async function scanGistCleanup(octokit: Octokit, gistId: string): Promise<GistCleanupPlan> {
  const { data } = await octokit.rest.gists.get({ gist_id: gistId });
  const revision = data.history?.[0]?.version;
  if (!revision || !/^[a-f0-9]{40,64}$/i.test(revision)) throw invalidManifest();
  const snapshot = await completeGistFileSnapshot(
    gistId,
    {
      ...data,
      truncated: data.truncated === true || data.files?.[MANIFEST_FILE_NAME]?.truncated === true,
    },
    checkedFilenames,
  );
  const manifest = parseGistManifest(snapshot[MANIFEST_FILE_NAME]?.content ?? '');
  const protectedNames = protectedFilenames(manifest);
  for (const name of [...protectedNames]) {
    const aliases = chunkAliases(name);
    // 索引侧车不参与正文读取；正文缺失时停止，保留可供修复的旧布局。
    if (
      !data.truncated &&
      !name.endsWith('.meta.json') &&
      !aliases.some((alias) => data.files?.[alias])
    )
      throw invalidManifest();
    aliases.forEach((alias) => protectedNames.add(alias));
  }
  const files = Object.entries(data.files ?? {})
    .filter(([name, file]) => {
      const key = managedEntryKey(name);
      // API 截断时无法确认活动条目的全部物理布局，保守保留其额外文件。
      return (
        file &&
        !protectedNames.has(name) &&
        key &&
        !(data.truncated && Object.hasOwn(manifest.entries, key))
      );
    })
    .map(([filename, file]) => ({ filename, ...(file?.size != null ? { size: file.size } : {}) }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
  return {
    gistId,
    revision,
    partial: data.truncated === true,
    files,
    totalBytes: files.reduce((sum, file) => sum + (file.size ?? 0), 0),
  };
}

function changed(): LocalizedError {
  return new LocalizedError('GIST_CLEANUP_CHANGED', 'syncUi.cleanup.changed');
}

/** 单次 PATCH 只删除已预览文件；不改写 manifest、描述或其它同步状态。 */
export async function executeGistCleanup(
  octokit: Octokit,
  gistId: string,
  plan: GistCleanupPlan,
): Promise<{ deletedCount: number }> {
  if (plan.gistId !== gistId) throw changed();
  const current = await scanGistCleanup(octokit, gistId);
  if (
    current.revision !== plan.revision ||
    current.partial !== plan.partial ||
    JSON.stringify(current.files) !== JSON.stringify(plan.files)
  )
    throw changed();
  if (!current.files.length) return { deletedCount: 0 };

  // raw manifest 下载期间也可能有其它设备写入；紧邻 PATCH 再核对修订。
  // GitHub Gist 不支持真正的条件 PATCH，这与普通同步一样是伪 CAS。
  const latest = await octokit.rest.gists.listCommits({ gist_id: gistId, per_page: 1 });
  if (latest.data[0]?.version !== plan.revision) throw changed();
  const files = Object.fromEntries(current.files.map((file) => [file.filename, null]));
  const response = await octokit.rest.gists.update({
    gist_id: gistId,
    // Octokit 的生成类型未包含 GitHub 文档支持的 null（删除文件）。
    files: files as unknown as Record<string, { content: string }>,
  });
  try {
    const revision = response.data.history?.[0]?.version;
    if (!revision || revision === plan.revision || !response.data.files) throw changed();
    for (const file of current.files) {
      if (response.data.files[file.filename]) throw changed();
    }
    if (response.data.truncated) {
      // 截断列表中的“未出现”不代表已删除；在新修订上逐个核对，避免大文件下载。
      const root = revisionRawRoot(gistId, revision, response.data.files);
      for (const file of current.files) {
        const check = await fetch(root + encodeURIComponent(file.filename), { method: 'HEAD' });
        if (check.status !== 404) throw changed();
      }
    }
  } catch {
    throw new LocalizedError('GIST_CLEANUP_UNVERIFIED', 'syncUi.cleanup.verifyFailed');
  }
  return { deletedCount: current.files.length };
}
