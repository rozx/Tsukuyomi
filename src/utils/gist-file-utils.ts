/**
 * Gist 文件名称常量
 */
const GIST_FILE_NAMES = {
  SETTINGS: 'luna-ai-settings.json',
  NOVEL_PREFIX: 'novel-',
  NOVEL_CHUNK_PREFIX: 'novel-chunk-',
} as const;

/**
 * 从分块文件名中提取书籍 ID
 * 支持两种格式：
 * - 新格式：novel-chunk-{id}#{index}.json（使用 # 作为分隔符）
 * - 旧格式：novel-chunk-{id}-{index}.json（向后兼容）
 * @param fileName 文件名
 * @returns 书籍 ID，如果不是分块文件则返回 null
 */
export function extractNovelIdFromChunkFileName(fileName: string): string | null {
  if (!fileName.startsWith(GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX)) {
    return null;
  }

  const prefix = GIST_FILE_NAMES.NOVEL_CHUNK_PREFIX;
  const prefixLength = prefix.length;
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex <= prefixLength) {
    return null;
  }

  const beforeDot = fileName.substring(0, dotIndex);

  // 优先尝试新格式（使用 # 分隔符）
  const hashIndex = beforeDot.lastIndexOf('#');
  if (hashIndex !== -1 && hashIndex > prefixLength && hashIndex < beforeDot.length - 1) {
    const indexPart = beforeDot.substring(hashIndex + 1);
    if (/^\d+$/.test(indexPart)) {
      const novelId = beforeDot.substring(prefixLength, hashIndex);
      if (
        novelId &&
        novelId.length > 0 &&
        !novelId.includes('#') &&
        !novelId.endsWith('-')
      ) {
        return novelId;
      }
    }
  }

  // 向后兼容：尝试旧格式（使用 - 分隔符）
  const lastDashIndex = beforeDot.lastIndexOf('-');
  if (
    lastDashIndex !== -1 &&
    lastDashIndex > prefixLength &&
    lastDashIndex < beforeDot.length - 1
  ) {
    const indexPart = beforeDot.substring(lastDashIndex + 1);
    if (/^\d+$/.test(indexPart)) {
      const novelId = beforeDot.substring(prefixLength, lastDashIndex);
      if (novelId && novelId.length > 0) {
        return novelId;
      }
    }
  }

  return null;
}

/**
 * 分组文件，将分块文件合并显示
 * @param files 文件列表，每个文件包含 filename 和 size
 * @returns 分组后的文件列表，分块文件合并为单个文件显示
 */
export function groupChunkFiles<T extends { filename: string; size?: number; sizeDiff?: number }>(
  files: T[],
): Array<T & { filename: string; size?: number; sizeDiff?: number }> {
  const chunkGroups = new Map<
    string,
    { filename: string; size: number; sizeDiff: number; originalFile: T }
  >();
  const regularFiles: T[] = [];

  for (const file of files) {
    const novelId = extractNovelIdFromChunkFileName(file.filename);
    if (novelId) {
      // 这是分块文件
      const groupKey = `novel-${novelId}`;
      if (!chunkGroups.has(groupKey)) {
        chunkGroups.set(groupKey, {
          filename: `novel-${novelId}.json`,
          size: 0,
          sizeDiff: 0,
          originalFile: file,
        });
      }
      const group = chunkGroups.get(groupKey)!;
      group.size += file.size || 0;
      group.sizeDiff += file.sizeDiff || 0;
    } else {
      // 普通文件
      regularFiles.push(file);
    }
  }

  // 合并分块组和普通文件
  const groupedFiles: Array<T & { filename: string; size?: number; sizeDiff?: number }> = [
    ...Array.from(chunkGroups.values()).map((group) => ({
      ...group.originalFile,
      filename: group.filename,
      size: group.size,
      sizeDiff: group.sizeDiff !== 0 ? group.sizeDiff : undefined,
    })),
    ...regularFiles,
  ];

  return groupedFiles;
}

