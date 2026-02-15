import { describe, test, expect } from 'bun:test';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  MAX_TASK_CHUNK_SIZE,
  MIN_TASK_CHUNK_SIZE,
  resolveTaskChunkSize,
  resolveRuntimeTaskChunkSize,
  buildChunks,
  buildFormattedChunks,
} from 'src/services/ai/tasks/utils/chunk-formatter';
import type { Paragraph } from 'src/models/novel';

describe('chunk-formatter', () => {
  describe('resolveTaskChunkSize', () => {
    test('应在未提供值时返回默认分块大小', () => {
      expect(resolveTaskChunkSize()).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在 null 时回退到默认分块大小', () => {
      expect(resolveTaskChunkSize(null as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在无效值时回退到默认分块大小', () => {
      expect(resolveTaskChunkSize(Number.NaN)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveTaskChunkSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveTaskChunkSize('abc' as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应将过小值钳制到最小分块大小', () => {
      expect(resolveTaskChunkSize(1)).toBe(MIN_TASK_CHUNK_SIZE);
      expect(resolveTaskChunkSize(-100)).toBe(MIN_TASK_CHUNK_SIZE);
    });

    test('应将过大值钳制到最大分块大小', () => {
      expect(resolveTaskChunkSize(999999)).toBe(MAX_TASK_CHUNK_SIZE);
    });

    test('应接受可转为数字的字符串值（脏数据兼容）', () => {
      expect(resolveTaskChunkSize('12000' as unknown as number)).toBe(12000);
    });

    test('应对小数向下取整', () => {
      expect(resolveTaskChunkSize(4321.9)).toBe(4321);
    });
  });

  describe('resolveRuntimeTaskChunkSize', () => {
    test('应在未提供值时返回默认分块大小', () => {
      expect(resolveRuntimeTaskChunkSize()).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在 null 时回退到默认分块大小', () => {
      expect(resolveRuntimeTaskChunkSize(null as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应在无效值时回退到默认分块大小', () => {
      expect(resolveRuntimeTaskChunkSize(Number.NaN)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveRuntimeTaskChunkSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TASK_CHUNK_SIZE);
      expect(resolveRuntimeTaskChunkSize('abc' as unknown as number)).toBe(DEFAULT_TASK_CHUNK_SIZE);
    });

    test('应允许小于 MIN_TASK_CHUNK_SIZE 的值（最小为 1）', () => {
      // 与 resolveTaskChunkSize 的关键区别：允许小分块
      expect(resolveRuntimeTaskChunkSize(1)).toBe(1);
      expect(resolveRuntimeTaskChunkSize(100)).toBe(100);
      expect(resolveRuntimeTaskChunkSize(500)).toBe(500);
      expect(resolveRuntimeTaskChunkSize(999)).toBe(999);
    });

    test('应将负值钳制到 1', () => {
      expect(resolveRuntimeTaskChunkSize(-100)).toBe(1);
      expect(resolveRuntimeTaskChunkSize(0)).toBe(1);
    });

    test('应将过大值钳制到最大分块大小', () => {
      expect(resolveRuntimeTaskChunkSize(999999)).toBe(MAX_TASK_CHUNK_SIZE);
    });

    test('应接受可转为数字的字符串值（脏数据兼容）', () => {
      expect(resolveRuntimeTaskChunkSize('12000' as unknown as number)).toBe(12000);
    });

    test('应对小数向下取整', () => {
      expect(resolveRuntimeTaskChunkSize(4321.9)).toBe(4321);
    });
  });
});

/**
 * Task 3.1: 测试 chunk 格式化在"含空段落章节"场景下的索引语义
 * 验证展示索引与原始章节位置一致（可跳号）
 */
describe('buildChunks - 空段落索引语义', () => {
  // 辅助函数：创建测试段落
  function createTestParagraph(id: string, text: string): Paragraph {
    return {
      id,
      text,
      translations: [],
      selectedTranslationId: '',
    };
  }

  test('应使用章节原始索引（空段落导致跳号）', () => {
    // 模拟章节：段落0正常，段落1空，段落2正常，段落3空，段落4正常
    const paragraphs = [
      createTestParagraph('para0', '第一段'), // 原始索引 0
      createTestParagraph('para1', ''), // 原始索引 1（空，将被过滤）
      createTestParagraph('para2', '第二段'), // 原始索引 2
      createTestParagraph('para3', '   '), // 原始索引 3（空白，将被过滤）
      createTestParagraph('para4', '第三段'), // 原始索引 4
    ];

    const chunks = buildChunks(
      paragraphs,
      10000,
      (para, originalIndex) => `[${originalIndex}] [ID: ${para.id}] ${para.text}`,
    );

    // 只有一个 chunk
    expect(chunks.length).toBe(1);
    const chunkText = chunks[0]!.text;

    // 验证索引：应该是 0, 2, 4（跳过了空段落1和3）
    expect(chunkText).toContain('[0] [ID: para0]');
    expect(chunkText).toContain('[2] [ID: para2]');
    expect(chunkText).toContain('[4] [ID: para4]');

    // 确保空段落没有出现在 chunk 中
    expect(chunkText).not.toContain('[ID: para1]');
    expect(chunkText).not.toContain('[ID: para3]');

    // 确保没有连续索引（1, 3被跳过）
    expect(chunkText).not.toContain('[1] [ID:');
    expect(chunkText).not.toContain('[3] [ID:');
  });

  test('应只包含非空段落的 ID', () => {
    const paragraphs = [
      createTestParagraph('para0', '内容0'),
      createTestParagraph('para1', ''),
      createTestParagraph('para2', '内容2'),
    ];

    const chunks = buildChunks(paragraphs, 10000, (para) => `[ID: ${para.id}] ${para.text}`);

    // paragraphIds 应只包含非空段落的 ID
    expect(chunks[0]!.paragraphIds).toEqual(['para0', 'para2']);
  });

  test('多个 chunk 时索引应保持章节原始位置', () => {
    // 创建足够多的段落以产生多个 chunk
    const paragraphs: Paragraph[] = [];

    // 段落 0-2：正常内容
    for (let i = 0; i < 3; i++) {
      paragraphs.push(createTestParagraph(`para${i}`, `内容内容内容内容${i}`));
    }
    // 段落 3：空
    paragraphs.push(createTestParagraph('para3', ''));
    // 段落 4-6：正常内容
    for (let i = 4; i < 7; i++) {
      paragraphs.push(createTestParagraph(`para${i}`, `内容内容内容内容${i}`));
    }

    const chunks = buildChunks(
      paragraphs,
      50, // 小 chunk size 以产生多个 chunk
      (para, originalIndex) => `[${originalIndex}] [ID: ${para.id}] ${para.text}`,
    );

    // 验证所有 chunk 中的索引都是章节原始位置
    const allText = chunks.map((c) => c.text).join('\n');

    // 应包含 0, 1, 2, 4, 5, 6
    expect(allText).toContain('[0] [ID: para0]');
    expect(allText).toContain('[1] [ID: para1]');
    expect(allText).toContain('[2] [ID: para2]');
    expect(allText).toContain('[4] [ID: para4]');
    expect(allText).toContain('[5] [ID: para5]');
    expect(allText).toContain('[6] [ID: para6]');

    // 不应包含 3（空段落）
    expect(allText).not.toContain('[3] [ID:');
  });
});
describe('buildFormattedChunks - 空段落索引语义', () => {
  function createTestParagraph(id: string, text: string, translation?: string): Paragraph {
    return {
      id,
      text,
      translations: translation ? [{ id: 't1', translation, aiModelId: 'model1' }] : [],
      selectedTranslationId: translation ? 't1' : '',
    };
  }
  test('应使用 originalIndices 映射中的章节原始索引', () => {
    // 模拟已过滤的段落列表（空段落已移除）
    const filteredParagraphs = [
      createTestParagraph('para0', '第一段', '译文1'),
      createTestParagraph('para2', '第二段', '译文2'),
      createTestParagraph('para4', '第三段', '译文3'),
    ];

    // 原始索引映射：记录每个段落在原始章节中的位置
    const originalIndices = new Map<string, number>();
    originalIndices.set('para0', 0);
    originalIndices.set('para2', 2); // 跳过了 1
    originalIndices.set('para4', 4); // 跳过了 3

    const chunks = buildFormattedChunks(filteredParagraphs, 10000, originalIndices);

    expect(chunks.length).toBe(1);
    const chunkText = chunks[0]!.text;

    // 验证索引使用原始位置
    expect(chunkText).toContain('[0] [ID: para0]');
    expect(chunkText).toContain('[2] [ID: para2]');
    expect(chunkText).toContain('[4] [ID: para4]');
  });

  test('无 originalIndices 时应回退到数组索引', () => {
    const paragraphs = [
      createTestParagraph('para0', '第一段', '译文1'),
      createTestParagraph('para2', '第二段', '译文2'),
    ];

    // 不提供 originalIndices，应使用数组索引 0, 1
    const chunks = buildFormattedChunks(paragraphs, 10000);

    const chunkText = chunks[0]!.text;
    expect(chunkText).toContain('[0] [ID: para0]');
    expect(chunkText).toContain('[1] [ID: para2]');
  });

  test('无 originalIndices 且多 chunk 时应保持连续数组索引', () => {
    const paragraphs = [
      createTestParagraph('para0', '第一段内容较长用于触发分块', '译文1'),
      createTestParagraph('para2', '第二段内容较长用于触发分块', '译文2'),
      createTestParagraph('para4', '第三段内容较长用于触发分块', '译文3'),
    ];

    const chunks = buildFormattedChunks(paragraphs, 70);

    expect(chunks.length).toBeGreaterThan(1);

    const allText = chunks.map((chunk) => chunk.text).join('\n');
    expect(allText).toContain('[0] [ID: para0]');
    expect(allText).toContain('[1] [ID: para2]');
    expect(allText).toContain('[2] [ID: para4]');

    // 未提供 originalIndices，不应出现原始章节索引跳号
    expect(allText).not.toContain('[4] [ID: para4]');
  });
});
