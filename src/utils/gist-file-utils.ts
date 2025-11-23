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

  // 优先尝试最新格式（使用 _ 作为分隔符，为了兼容 Gist 文件名限制）
  const underscoreIndex = beforeDot.lastIndexOf('_');
  if (
    underscoreIndex !== -1 &&
    underscoreIndex > prefixLength &&
    underscoreIndex < beforeDot.length - 1
  ) {
    const indexPart = beforeDot.substring(underscoreIndex + 1);
    if (/^\d+$/.test(indexPart)) {
      const novelId = beforeDot.substring(prefixLength, underscoreIndex);
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

  // 尝试旧格式（使用 # 分隔符）
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
 * 从普通文件名中提取书籍 ID（用于检测是否与分块文件对应）
 * @param fileName 文件名
 * @returns 书籍 ID，如果不是 novel-{id}.json 格式则返回 null
 */
function extractNovelIdFromRegularFileName(fileName: string): string | null {
  if (!fileName.startsWith(GIST_FILE_NAMES.NOVEL_PREFIX)) {
    return null;
  }
  if (!fileName.endsWith('.json')) {
    return null;
  }
  // 格式: novel-{id}.json
  const match = fileName.match(/^novel-(.+)\.json$/);
  if (match && match[1]) {
    return match[1];
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
  const regularFilesToMerge = new Map<string, T>();

  // 第一遍：处理所有文件，识别分块文件和普通文件
  for (const file of files) {
    const novelIdFromChunk = extractNovelIdFromChunkFileName(file.filename);
    if (novelIdFromChunk) {
      // 这是分块文件
      const groupKey = `novel-${novelIdFromChunk}`;
      if (!chunkGroups.has(groupKey)) {
        chunkGroups.set(groupKey, {
          filename: `novel-${novelIdFromChunk}.json`,
          size: 0,
          sizeDiff: 0,
          originalFile: file,
        });
      }
      const group = chunkGroups.get(groupKey)!;
      group.size += file.size || 0;
      group.sizeDiff += file.sizeDiff || 0;
    } else {
      // 普通文件 - 检查是否是 novel-{id}.json 格式
      const novelIdFromRegular = extractNovelIdFromRegularFileName(file.filename);
      if (novelIdFromRegular) {
        // 可能是需要合并的文件，先暂存
        regularFilesToMerge.set(file.filename, file);
      } else {
        // 不是小说文件，直接添加到普通文件列表
        regularFiles.push(file);
      }
    }
  }

  // 第二遍：将匹配的普通文件合并到分块组中
  for (const [filename, file] of regularFilesToMerge.entries()) {
    const novelIdFromRegular = extractNovelIdFromRegularFileName(filename);
    if (novelIdFromRegular && chunkGroups.has(`novel-${novelIdFromRegular}`)) {
      // 存在对应的分块组，合并到分块组中
      const groupKey = `novel-${novelIdFromRegular}`;
      const group = chunkGroups.get(groupKey)!;
      group.size += file.size || 0;
      group.sizeDiff += file.sizeDiff || 0;
      // 不添加到 regularFiles，因为已经合并
    } else {
      // 没有对应的分块组，作为普通文件处理
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

