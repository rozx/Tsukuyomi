import { describe, it } from 'bun:test';
import { expect } from 'vitest';
import './setup';
import { matchImportParagraphs } from '../services/import/import-paragraph-matching';
import type { ImportNewParagraph, ImportOldParagraph } from '../models/import-matching';

function old(text: string, id: string, chapterId = 'old', versions = 1): ImportOldParagraph {
  return {
    chapterId,
    paragraph: {
      id,
      text,
      translations: Array.from({ length: versions }, (_, index) => ({
        id: `${id}-t${index}`,
        translation: `译文${id}-${index}`,
        aiModelId: 'm',
      })),
      selectedTranslationId: versions ? `${id}-t0` : '',
    },
  };
}
function next(text: string, index: number, chapterId = 'old'): ImportNewParagraph {
  return { key: `draft:${index}`, text, chapterId, newId: `new-${index}` };
}

describe('导入精确段落匹配', () => {
  it('大量分散修订使用有界线性分段，不在每个锚点重新扫描全文', async () => {
    const before = Array.from({ length: 50000 }, (_, index) =>
      old(`原文${index}`, `p${index}`, 'old', 0),
    );
    const after = before.map((item, index) =>
      next(index % 2 ? item.paragraph.text : `修订${index}`, index),
    );
    const result = await matchImportParagraphs(
      { scopeId: 'large:1', old: before, next: after },
      { limits: { timeoutMs: 2500 } },
    );
    expect(result.conflicts).toEqual([]);
    expect(result.changes.filter((change) => change.kind === 'revise')).toHaveLength(25000);
  }, 15000);
  it('插入造成索引偏移仍保留各自 ID、全部译文及当前选用', async () => {
    const before = [old('第一段', 'a', 'old', 2), old('第二段', 'b'), old('第三段', 'c')];
    const result = await matchImportParagraphs({
      scopeId: 'book:1',
      old: before,
      next: ['第一段', '新增', '第二段', '第三段'].map((text, index) => next(text, index)),
    });
    expect(result.conflicts).toEqual([]);
    expect(result.paragraphs.map((item) => item.paragraph.id)).toEqual(['a', 'new-1', 'b', 'c']);
    expect(result.paragraphs[0]?.paragraph).toEqual(before[0]!.paragraph);
    expect(result.paragraphs[1]?.paragraph.translations).toEqual([]);
  });

  it('跨章移动与重排保留未变译文，修订只清空实际改变的段落', async () => {
    const before = [
      old('原文甲', 'a', 'first', 2),
      old('锚点', 'anchor', 'first'),
      old('原文乙', 'b', 'second', 3),
    ];
    const result = await matchImportParagraphs({
      scopeId: 'book:2',
      old: before,
      next: [next('原文甲', 0, 'merged'), next('锚点', 1, 'merged'), next('修订乙', 2, 'merged')],
    });
    expect(result.conflicts).toEqual([]);
    expect(result.paragraphs[0]?.paragraph).toEqual(before[0]!.paragraph);
    expect(result.paragraphs[2]?.paragraph).toEqual({
      id: 'b',
      text: '修订乙',
      translations: [],
      selectedTranslationId: '',
    });
    expect(result.changes.find((change) => change.paragraphId === 'b')?.clearedVersions).toBe(3);
    expect(
      result.changes.some((change) => change.kind === 'move' && change.paragraphId === 'a'),
    ).toBe(true);
  });

  it('三个修订段落合计五个版本，标点和空白差异不能被近似归一化', async () => {
    const before = [
      old('甲。', 'a', 'old', 2),
      old('锚一', 'x'),
      old('乙', 'b', 'old', 2),
      old('锚二', 'y'),
      old('丙', 'c'),
    ];
    const result = await matchImportParagraphs({
      scopeId: 'book:3',
      old: before,
      next: ['甲！', '锚一', '　乙', '锚二', '丙改'].map((text, index) => next(text, index)),
    });
    const revisions = result.changes.filter((change) => change.kind === 'revise');
    expect(revisions).toHaveLength(3);
    expect(revisions.reduce((total, change) => total + change.clearedVersions, 0)).toBe(5);
  });

  it('重复句子的歧义不随机移植译文；完整相同序列可按唯一顺序保留', async () => {
    const before = [old('重复', 'a'), old('重复', 'b')];
    const ambiguous = await matchImportParagraphs({
      scopeId: 'book:1',
      old: before,
      next: [next('重复', 0)],
    });
    expect(ambiguous.conflicts.some((conflict) => conflict.code === 'AMBIGUOUS_PARAGRAPH')).toBe(
      true,
    );
    expect(ambiguous.paragraphs[0]?.paragraph.translations).toEqual([]);
    const identical = await matchImportParagraphs({
      scopeId: 'book:1',
      old: before,
      next: [next('重复', 0), next('重复', 1)],
    });
    expect(identical.conflicts).toEqual([]);
    expect(identical.paragraphs.map((item) => item.paragraph.id)).toEqual(['a', 'b']);
  });

  it('唯一的前后文约束能定位重复文本，显式既有引用也能选择正确一处', async () => {
    const result = await matchImportParagraphs({
      scopeId: 'book:1',
      old: [old('重复', 'a'), old('中间旧文', 'b'), old('重复', 'c')],
      next: ['重复', '中间新文', '重复'].map((text, index) => next(text, index)),
    });
    expect(result.conflicts).toEqual([]);
    expect(result.paragraphs.map((item) => item.paragraph.id)).toEqual(['a', 'b', 'c']);
    const explicit = await matchImportParagraphs({
      scopeId: 'book:1',
      old: [old('重复', 'a'), old('重复', 'b')],
      next: [{ ...next('重复', 0, 'moved'), existing: { chapterId: 'old', paragraphId: 'b' } }],
    });
    expect(explicit.paragraphs[0]?.paragraph.id).toBe('b');
    expect(explicit.paragraphs[0]?.paragraph.selectedTranslationId).toBe('b-t0');
  });

  it('多对多替换给出固定范围及实际损失，只有绑定签名的用户选择才解除冲突', async () => {
    const input = {
      scopeId: 'book:1',
      old: [old('旧甲', 'a', 'old', 2), old('旧乙', 'b', 'old', 3)],
      next: ['新甲', '新乙', '新丙'].map((text, index) => next(text, index)),
    };
    const preview = await matchImportParagraphs(input);
    expect(preview.replacements[0]?.clearedVersions).toBe(5);
    expect(preview.conflicts[0]?.code).toBe('REPLACEMENT_REQUIRED');
    const confirmed = await matchImportParagraphs({
      ...input,
      allowedReplacements: [preview.replacements[0]!.signature],
    });
    expect(confirmed.conflicts).toEqual([]);
    expect(confirmed.paragraphs.every((item) => item.paragraph.translations.length === 0)).toBe(
      true,
    );
    const changed = await matchImportParagraphs({
      ...input,
      scopeId: 'book:2',
      allowedReplacements: [preview.replacements[0]!.signature],
    });
    expect(changed.conflicts).not.toEqual([]);
  });
});
