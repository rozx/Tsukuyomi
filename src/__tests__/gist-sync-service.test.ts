// Bun 测试框架提供全局函数，直接使用即可
// 这些函数在运行时由 Bun 提供，无需导入
// 使用函数签名类型避免 import() 类型注解（符合 ESLint 规范）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const describe: (name: string, fn: () => void) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const test: (name: string, fn: () => void | Promise<void>) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const expect: (actual: unknown) => {
  toBe: (expected: unknown) => void;
  toBeNull: () => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
};

/**
 * 测试分块文件名提取逻辑
 * 这个测试验证从分块文件名中正确提取 novelId 的逻辑
 */
describe('Gist Sync Service - 分块文件名提取', () => {
  const NOVEL_CHUNK_PREFIX = 'novel-chunk-';
  const prefixLength = NOVEL_CHUNK_PREFIX.length; // 应该是 12

  /**
   * 提取 novelId 的辅助函数（模拟实际代码逻辑）
   */
  function extractNovelIdFromChunkFileName(fileName: string): string | null {
    if (!fileName.startsWith(NOVEL_CHUNK_PREFIX)) {
      return null;
    }

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
        if (novelId && novelId.length > 0 && !novelId.includes('#') && !novelId.endsWith('-')) {
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

  describe('新格式（使用 # 分隔符）', () => {
    test('应该正确提取简单的 UUID', () => {
      const fileName = 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#0.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      expect(novelId).toBe('00f8fa01-08ab-4623-ad90-b2c023ed0855');
    });

    test('应该正确提取多个分块文件的 novelId', () => {
      const testCases = [
        {
          fileName: 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#0.json',
          expected: '00f8fa01-08ab-4623-ad90-b2c023ed0855',
        },
        {
          fileName: 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#1.json',
          expected: '00f8fa01-08ab-4623-ad90-b2c023ed0855',
        },
        {
          fileName: 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#10.json',
          expected: '00f8fa01-08ab-4623-ad90-b2c023ed0855',
        },
        {
          fileName: 'novel-chunk-b5a46a69-eea4-43c5-bd28-2e44834ec688#0.json',
          expected: 'b5a46a69-eea4-43c5-bd28-2e44834ec688',
        },
        {
          fileName: 'novel-chunk-b5a46a69-eea4-43c5-bd28-2e44834ec688#1.json',
          expected: 'b5a46a69-eea4-43c5-bd28-2e44834ec688',
        },
        {
          fileName: 'novel-chunk-d611475c-5ec0-4d1d-a9f6-edb2d2769759#5.json',
          expected: 'd611475c-5ec0-4d1d-a9f6-edb2d2769759',
        },
      ];

      for (const testCase of testCases) {
        const novelId = extractNovelIdFromChunkFileName(testCase.fileName);
        expect(novelId).toBe(testCase.expected);
      }
    });

    test('不应该提取包含 # 的 novelId', () => {
      const fileName = 'novel-chunk-invalid#id#0.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      // 这种情况应该返回 null，因为 novelId 不应该包含 #
      expect(novelId).toBeNull();
    });
  });

  describe('旧格式（使用 - 分隔符，向后兼容）', () => {
    test('应该正确提取简单的 UUID（旧格式）', () => {
      const fileName = 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855-0.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      expect(novelId).toBe('00f8fa01-08ab-4623-ad90-b2c023ed0855');
    });

    test('应该正确提取多个分块文件的 novelId（旧格式）', () => {
      const testCases = [
        {
          fileName: 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855-0.json',
          expected: '00f8fa01-08ab-4623-ad90-b2c023ed0855',
        },
        {
          fileName: 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855-1.json',
          expected: '00f8fa01-08ab-4623-ad90-b2c023ed0855',
        },
        {
          fileName: 'novel-chunk-b5a46a69-eea4-43c5-bd28-2e44834ec688-3.json',
          expected: 'b5a46a69-eea4-43c5-bd28-2e44834ec688',
        },
      ];

      for (const testCase of testCases) {
        const novelId = extractNovelIdFromChunkFileName(testCase.fileName);
        expect(novelId).toBe(testCase.expected);
      }
    });
  });

  describe('边界情况', () => {
    test('应该处理空文件名', () => {
      const novelId = extractNovelIdFromChunkFileName('');
      expect(novelId).toBeNull();
    });

    test('应该处理不匹配的文件名', () => {
      const fileName = 'novel-00f8fa01-08ab-4623-ad90-b2c023ed0855.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      expect(novelId).toBeNull();
    });

    test('应该处理缺少索引的文件名', () => {
      const fileName = 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      expect(novelId).toBeNull();
    });

    test('应该处理无效索引的文件名', () => {
      const fileName = 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#abc.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      expect(novelId).toBeNull();
    });

    test('应该处理索引为 0 的情况', () => {
      const fileName = 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#0.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      expect(novelId).toBe('00f8fa01-08ab-4623-ad90-b2c023ed0855');
    });

    test('应该处理大索引号', () => {
      const fileName = 'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#99.json';
      const novelId = extractNovelIdFromChunkFileName(fileName);
      expect(novelId).toBe('00f8fa01-08ab-4623-ad90-b2c023ed0855');
    });
  });

  describe('实际场景测试', () => {
    test('应该从多个分块文件中提取相同的 novelId', () => {
      const fileNames = [
        'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#0.json',
        'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#1.json',
        'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#2.json',
      ];

      const novelIds = new Set<string>();
      for (const fileName of fileNames) {
        const novelId = extractNovelIdFromChunkFileName(fileName);
        if (novelId) {
          novelIds.add(novelId);
        }
      }

      // 所有分块文件应该提取出相同的 novelId
      expect(novelIds.size).toBe(1);
      expect(novelIds.has('00f8fa01-08ab-4623-ad90-b2c023ed0855')).toBe(true);
    });

    test('应该区分不同书籍的分块文件', () => {
      const fileNames = [
        'novel-chunk-00f8fa01-08ab-4623-ad90-b2c023ed0855#0.json',
        'novel-chunk-b5a46a69-eea4-43c5-bd28-2e44834ec688#0.json',
        'novel-chunk-d611475c-5ec0-4d1d-a9f6-edb2d2769759#0.json',
      ];

      const novelIds = new Set<string>();
      for (const fileName of fileNames) {
        const novelId = extractNovelIdFromChunkFileName(fileName);
        if (novelId) {
          novelIds.add(novelId);
        }
      }

      // 应该提取出 3 个不同的 novelId
      expect(novelIds.size).toBe(3);
      expect(novelIds.has('00f8fa01-08ab-4623-ad90-b2c023ed0855')).toBe(true);
      expect(novelIds.has('b5a46a69-eea4-43c5-bd28-2e44834ec688')).toBe(true);
      expect(novelIds.has('d611475c-5ec0-4d1d-a9f6-edb2d2769759')).toBe(true);
    });
  });
});
