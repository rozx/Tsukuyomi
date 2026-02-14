/**
 * paragraph_id 提交语义测试
 * 验证提示词约束和 chunk 构建输出中的 paragraph_id 标识
 */

import { describe, test, expect } from 'bun:test';
import { buildTranslationSystemPrompt } from '../services/ai/tasks/prompts/translation';
import { buildPolishSystemPrompt } from '../services/ai/tasks/prompts/polish';
import { buildProofreadingSystemPrompt } from '../services/ai/tasks/prompts/proofreading';
import { buildFormattedChunks } from '../services/ai/tasks/utils/chunk-formatter';
import type { Paragraph, Translation } from '../models/novel';
import { generateShortId } from '../utils/id-generator';

// 辅助函数：创建测试用段落
function createTestParagraph(id: string, text: string, translation?: string): Paragraph {
  const transId = generateShortId();
  const translations: Translation[] = translation
    ? [{ id: transId, translation, aiModelId: 'model-1' }]
    : [{ id: transId, translation: '测试翻译', aiModelId: 'model-1' }];
  return {
    id,
    text,
    selectedTranslationId: transId,
    translations,
  };
}

describe('提示词约束测试（paragraph_id）', () => {
  describe('翻译提示词', () => {
    test('应包含 paragraph_id 提交要求', () => {
      const prompt = buildTranslationSystemPrompt({});
      expect(prompt).toContain('paragraph_id');
    });

    test('应明确禁止使用 index 提交', () => {
      const prompt = buildTranslationSystemPrompt({});
      expect(prompt).toContain('禁止使用 index');
    });

    test('应指引从 [ID: xxx] 获取 paragraph_id', () => {
      const prompt = buildTranslationSystemPrompt({});
      expect(prompt).toContain('[ID:');
    });
  });

  describe('润色提示词', () => {
    test('应包含 paragraph_id 提交要求', () => {
      const prompt = buildPolishSystemPrompt({});
      expect(prompt).toContain('paragraph_id');
    });

    test('应明确禁止使用 index 提交', () => {
      const prompt = buildPolishSystemPrompt({});
      expect(prompt).toContain('禁止使用 index');
    });

    test('应指引从 [ID: xxx] 获取 paragraph_id', () => {
      const prompt = buildPolishSystemPrompt({});
      expect(prompt).toContain('[ID:');
    });
  });

  describe('校对提示词', () => {
    test('应包含 paragraph_id 提交要求', () => {
      const prompt = buildProofreadingSystemPrompt({});
      expect(prompt).toContain('paragraph_id');
    });

    test('应明确禁止使用 index 提交', () => {
      const prompt = buildProofreadingSystemPrompt({});
      expect(prompt).toContain('禁止使用 index');
    });

    test('应指引从 [ID: xxx] 获取 paragraph_id', () => {
      const prompt = buildProofreadingSystemPrompt({});
      expect(prompt).toContain('[ID:');
    });
  });
});

describe('chunk 构建输出 paragraph_id 标识测试', () => {
  test('buildFormattedChunks 输出应包含 [ID: xxx] 标记', () => {
    const paragraphs = [
      createTestParagraph('abc123', '原文段落一', '翻译一'),
      createTestParagraph('def456', '原文段落二', '翻译二'),
    ];

    const chunks = buildFormattedChunks(paragraphs, 10000);

    expect(chunks.length).toBeGreaterThan(0);
    const chunkText = chunks[0]!.text;

    // 验证 [ID: xxx] 标记存在
    expect(chunkText).toContain('[ID: abc123]');
    expect(chunkText).toContain('[ID: def456]');
  });

  test('buildFormattedChunks 应在 paragraphIds 中返回段落 ID', () => {
    const paragraphs = [
      createTestParagraph('id-aaa', '段落1', '翻译1'),
      createTestParagraph('id-bbb', '段落2', '翻译2'),
      createTestParagraph('id-ccc', '段落3', '翻译3'),
    ];

    const chunks = buildFormattedChunks(paragraphs, 10000);

    // 所有段落 ID 都应出现在 chunks 的 paragraphIds 中
    const allParagraphIds = chunks.flatMap((c) => c.paragraphIds);
    expect(allParagraphIds).toContain('id-aaa');
    expect(allParagraphIds).toContain('id-bbb');
    expect(allParagraphIds).toContain('id-ccc');
  });

  test('buildFormattedChunks 每个段落的 [ID: xxx] 应在原文行内', () => {
    const paragraphs = [createTestParagraph('test-id', '测试原文', '测试翻译')];

    const chunks = buildFormattedChunks(paragraphs, 10000);
    const chunkText = chunks[0]!.text;

    // 格式为 [index] [ID: xxx] 原文: ...
    expect(chunkText).toMatch(/\[\d+\] \[ID: test-id\] 原文:/);
  });

  test('分块后每个 chunk 的 [ID: xxx] 标记与 paragraphIds 对应', () => {
    // 创建足够多的段落以产生多个 chunk
    const paragraphs = Array.from({ length: 20 }, (_, i) => {
      const id = `para-${String(i).padStart(3, '0')}`;
      return createTestParagraph(id, `这是一段非常长的测试原文`.repeat(10), `长翻译`.repeat(10));
    });

    // 使用较小的 chunk size 来确保分块
    const chunks = buildFormattedChunks(paragraphs, 500);

    // 每个 chunk 的 paragraphIds 中的 ID 都应在 chunk text 中有 [ID: xxx] 标记
    for (const chunk of chunks) {
      for (const id of chunk.paragraphIds) {
        expect(chunk.text).toContain(`[ID: ${id}]`);
      }
    }
  });
});
