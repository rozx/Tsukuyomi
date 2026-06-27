/**
 * 同步修订历史的文件展示工具（从 SyncSettingsTab 抽出，供 SyncRevisionFileList 复用）。
 * 纯函数：合并分块、归类显示名 / 图标、排序、格式化。
 */
import { groupChunkFiles } from 'src/services/gist-sync-service';
import { formatFileSize as formatFileSizeBase } from 'src/utils/format';

// 格式化文件大小（复用 utils/format 的共享实现，此处保留 1 位小数）
export const formatFileSize = (bytes: number): string => formatFileSizeBase(bytes, 1);

// 判断是否为元数据文件（分块 novel/memories 的 meta.json 描述文件）
export const isMetaFile = (filename: string): boolean => {
  if (!filename.endsWith('.meta.json')) return false;
  return filename.startsWith('novel-') || filename.startsWith('memories-');
};

// 从文件名中提取小说 ID（支持单文件与分块格式）
const extractNovelIdFromFilename = (filename: string): string | null => {
  if (filename.startsWith('novel-chunk-') || filename.startsWith('memories-')) return null;
  const match = filename.match(/^novel-(.+)\.json$/);
  if (match && match[1]) return match[1];
  if (filename.startsWith('novel-') && !filename.startsWith('novel-chunk-')) {
    const id = filename.replace(/^novel-/, '').replace(/\.json$/, '');
    return id || null;
  }
  return null;
};

const extractMemoriesBookIdFromFilename = (filename: string): string | null => {
  if (filename.startsWith('memories-chunk-')) return null;
  const match = filename.match(/^memories-(.+)\.json$/);
  if (match && match[1]) return match[1];
  if (filename.startsWith('memories-')) {
    const id = filename.replace(/^memories-/, '').replace(/\.json$/, '');
    return id || null;
  }
  return null;
};

const extractMemoriesBookIdFromChunkFilename = (filename: string): string | null => {
  if (!filename.startsWith('memories-chunk-')) return null;
  const match = filename.match(/^memories-chunk-(.+?)[_#-]\d+\.json$/);
  return match && match[1] ? match[1] : null;
};

const GLOBAL_FILE_DISPLAY: Record<string, { displayName: string; icon: string }> = {
  'tsukuyomi-settings.json': { displayName: '应用设置', icon: 'pi pi-cog' },
  'manifest.json': { displayName: '同步清单', icon: 'pi pi-list' },
  'ai-models.json': { displayName: 'AI 模型配置', icon: 'pi pi-microchip-ai' },
  'cover-history.json': { displayName: '封面历史', icon: 'pi pi-images' },
};

const findNovelFileDisplay = (
  filename: string,
  novels: Array<{ id: string; title?: string }>,
): { displayName: string; icon: string } | null => {
  const novelId = extractNovelIdFromFilename(filename);
  if (!novelId) return null;
  const novel = novels.find((b) => b.id === novelId);
  return novel
    ? { displayName: novel.title || filename, icon: 'pi pi-book' }
    : { displayName: `[已删除] ${filename}`, icon: 'pi pi-trash' };
};

const findMemoriesFileDisplay = (
  filename: string,
  novels: Array<{ id: string; title?: string }>,
): { displayName: string; icon: string } | null => {
  const memoriesBookId =
    extractMemoriesBookIdFromFilename(filename) || extractMemoriesBookIdFromChunkFilename(filename);
  if (!memoriesBookId) return null;
  const novel = novels.find((b) => b.id === memoriesBookId);
  return novel
    ? { displayName: `[记忆] ${novel.title || memoriesBookId}`, icon: 'pi pi-bookmark' }
    : { displayName: `[记忆-已删除] ${filename}`, icon: 'pi pi-trash' };
};

const getFileDisplayInfo = (
  filename: string,
  novels: Array<{ id: string; title?: string }>,
): { displayName: string; icon: string } => {
  const global = GLOBAL_FILE_DISPLAY[filename];
  if (global) return global;
  return (
    findNovelFileDisplay(filename, novels) ||
    findMemoriesFileDisplay(filename, novels) || { displayName: filename, icon: 'pi pi-file' }
  );
};

const extractMemoriesBookIdFromChunkForGrouping = (filename: string): string | null =>
  extractMemoriesBookIdFromChunkFilename(filename);

// 将 memories 分块文件合并为单个条目（类似 groupChunkFiles 对 novel 的处理）
const groupMemoriesChunks = <
  T extends {
    filename: string;
    size?: number;
    sizeDiff?: number;
  },
>(
  files: T[],
): T[] => {
  const chunkGroups = new Map<
    string,
    { filename: string; size: number; sizeDiff: number; originalFile: T }
  >();
  const nonChunkFiles: T[] = [];

  for (const file of files) {
    const bookId = extractMemoriesBookIdFromChunkForGrouping(file.filename);
    if (bookId) {
      const key = `memories-${bookId}`;
      if (!chunkGroups.has(key)) {
        chunkGroups.set(key, {
          filename: `memories-${bookId}.json`,
          size: 0,
          sizeDiff: 0,
          originalFile: file,
        });
      }
      const group = chunkGroups.get(key)!;
      group.size += file.size || 0;
      group.sizeDiff += file.sizeDiff || 0;
    } else {
      nonChunkFiles.push(file);
    }
  }

  return [
    ...Array.from(chunkGroups.values()).map((group) => ({
      ...group.originalFile,
      filename: group.filename,
      size: group.size,
      sizeDiff: group.sizeDiff,
    })),
    ...nonChunkFiles,
  ];
};

const fileSortPriority = (filename: string): number => {
  if (filename === 'manifest.json') return 0;
  if (filename === 'tsukuyomi-settings.json') return 1;
  if (filename === 'ai-models.json') return 2;
  if (filename === 'cover-history.json') return 3;
  if (filename.startsWith('memories-')) return 5; // memories 排在 novel 后
  if (filename.startsWith('novel-')) return 4;
  return 6;
};

export type RevisionFileStatus = 'added' | 'removed' | 'modified' | 'renamed';
export type GroupedRevisionFile = {
  filename: string;
  displayName: string;
  icon: string;
  status: RevisionFileStatus;
  size?: number;
  sizeDiff?: number;
};

// 分组文件，将分块文件合并显示，并过滤元数据文件
export const getGroupedFiles = (
  files: Array<{
    filename: string;
    status: RevisionFileStatus;
    size?: number;
    sizeDiff?: number;
  }>,
  novels: Array<{ id: string; title?: string }>,
): GroupedRevisionFile[] => {
  const filteredFiles = files.filter((file) => !isMetaFile(file.filename));
  const afterNovelGrouping = groupChunkFiles(filteredFiles);
  const grouped = groupMemoriesChunks(afterNovelGrouping);

  const filesWithDisplayInfo = grouped.map((file) => {
    const displayInfo = getFileDisplayInfo(file.filename, novels);
    return {
      ...file,
      displayName: displayInfo.displayName,
      icon: displayInfo.icon,
    };
  });

  return filesWithDisplayInfo.sort((a, b) => {
    const priA = fileSortPriority(a.filename);
    const priB = fileSortPriority(b.filename);
    if (priA !== priB) return priA - priB;
    return a.displayName.localeCompare(b.displayName, 'zh-CN');
  });
};
