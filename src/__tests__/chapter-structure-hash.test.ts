import { describe, expect, it } from 'vitest';
import './setup';

import type { Paragraph } from 'src/models/novel';
import { chapterStructureHash } from 'src/utils/chapter-structure-hash';

function para(id: string, text: string, translations: string[] = []): Paragraph {
  const list = translations.map((t, i) => ({
    id: `${id}-t${i}`,
    translation: t,
    aiModelId: 'model',
  }));
  return { id, text, selectedTranslationId: list[0]?.id ?? '', translations: list };
}

describe('chapterStructureHash', () => {
  const base = [para('p1', '一'), para('p2', '二'), para('p3', '三')];

  it('相同的段落 ID 与原文产生相同指纹', async () => {
    const copy = base.map((p) => ({ ...p }));
    expect(await chapterStructureHash(copy)).toBe(await chapterStructureHash(base));
  });

  it('新增译文后指纹不变', async () => {
    const translated = [para('p1', '一', ['one']), para('p2', '二', ['two', 'deux']), base[2]!];
    expect(await chapterStructureHash(translated)).toBe(await chapterStructureHash(base));
  });

  it('改选译文后指纹不变', async () => {
    const a = [para('p1', '一', ['one', 'uno'])];
    const b = [{ ...a[0]!, selectedTranslationId: 'p1-t1' }];
    expect(await chapterStructureHash(b)).toBe(await chapterStructureHash(a));
  });

  it('修改原文后指纹改变', async () => {
    const edited = [base[0]!, para('p2', '二改'), base[2]!];
    expect(await chapterStructureHash(edited)).not.toBe(await chapterStructureHash(base));
  });

  it('调整段落顺序后指纹改变', async () => {
    const reordered = [base[1]!, base[0]!, base[2]!];
    expect(await chapterStructureHash(reordered)).not.toBe(await chapterStructureHash(base));
  });

  it('删除段落后指纹改变', async () => {
    expect(await chapterStructureHash(base.slice(0, 2))).not.toBe(
      await chapterStructureHash(base),
    );
  });

  it('新增段落后指纹改变', async () => {
    const added = [...base, para('p4', '四')];
    expect(await chapterStructureHash(added)).not.toBe(await chapterStructureHash(base));
  });

  it('同一原文换了段落 ID 后指纹改变', async () => {
    const renamed = [para('px', '一'), base[1]!, base[2]!];
    expect(await chapterStructureHash(renamed)).not.toBe(await chapterStructureHash(base));
  });
});
