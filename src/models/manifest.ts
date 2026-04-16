/**
 * Gist 同步 manifest 相关类型与常量
 *
 * manifest.json 是 Gist 中的权威索引，列出每个同步条目的内容哈希与元数据。
 * 客户端基于 manifest 决定哪些文件需要上传/下载，实现选择性增量同步。
 */

/** 本版本客户端支持的 manifest schema 版本 */
export const MANIFEST_SCHEMA_VERSION = 2;

/** Gist 中 manifest 文件的文件名 */
export const MANIFEST_FILE_NAME = 'manifest.json';

/**
 * manifest 中单个条目的记录
 * - `hash`：SHA-256 十六进制小写，基于压缩前的 JSON 字符串计算
 * - `lastEdited`：条目最后编辑时间的 ISO 8601 字符串（用于展示/调试）
 * - `chunks`：若条目被分块存储，记录块数量；单文件为 0 或省略
 */
export interface ManifestEntry {
  hash: string;
  lastEdited: string;
  chunks?: number;
}

/**
 * Gist 中的 manifest.json 结构
 * - `schemaVersion`：布局版本号；旧版本客户端遇到更大的值必须拒绝同步
 * - `updatedAt`：生成 manifest 时的客户端时间（仅供调试，不参与决策）
 * - `entries`：条目键 -> 条目元数据
 *   条目键约定：
 *     - `settings`
 *     - `ai-models`
 *     - `cover-history`
 *     - `novel:<bookId>`
 *     - `memories:<bookId>`
 */
export interface GistManifest {
  schemaVersion: number;
  updatedAt: string;
  entries: Record<string, ManifestEntry>;
}

/**
 * Manifest 条目键的命名空间前缀
 */
export const ENTRY_KEYS = {
  SETTINGS: 'settings',
  AI_MODELS: 'ai-models',
  COVER_HISTORY: 'cover-history',
  NOVEL_PREFIX: 'novel:',
  MEMORIES_PREFIX: 'memories:',
} as const;

/**
 * 从书籍 ID 构造 novel 条目键
 */
export function novelEntryKey(bookId: string): string {
  return `${ENTRY_KEYS.NOVEL_PREFIX}${bookId}`;
}

/**
 * 从书籍 ID 构造 memories 条目键
 */
export function memoriesEntryKey(bookId: string): string {
  return `${ENTRY_KEYS.MEMORIES_PREFIX}${bookId}`;
}

/**
 * 判断 entry key 是否为 novel 类型，返回 bookId
 */
export function parseNovelEntryKey(key: string): string | null {
  return key.startsWith(ENTRY_KEYS.NOVEL_PREFIX)
    ? key.slice(ENTRY_KEYS.NOVEL_PREFIX.length)
    : null;
}

/**
 * 判断 entry key 是否为 memories 类型，返回 bookId
 */
export function parseMemoriesEntryKey(key: string): string | null {
  return key.startsWith(ENTRY_KEYS.MEMORIES_PREFIX)
    ? key.slice(ENTRY_KEYS.MEMORIES_PREFIX.length)
    : null;
}

/**
 * manifest diff 结果：三组 entry key
 * - `changed`：双方都有，但 hash 不同
 * - `added`：本地有，远端没有（或反之，看语境）
 * - `deleted`：远端有，本地没有（或反之，看语境）
 */
export interface ManifestDiff {
  changed: string[];
  added: string[];
  deleted: string[];
}
