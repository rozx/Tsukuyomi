import './setup';
import { describe, expect, it } from 'bun:test';
import {
  buildNovelFromFormData,
  buildNovelUpdatesFromFormData,
} from 'src/utils/novel-form';
import type { Novel } from 'src/models/novel';

describe('buildNovelFromFormData', () => {
  it('最小输入仅含 title 时返回含 id / 时间戳的完整 Novel', () => {
    const before = Date.now();
    const novel = buildNovelFromFormData({ title: '书名' });
    const after = Date.now();

    expect(novel.id).toBeTruthy();
    expect(novel.title).toBe('书名');
    expect(novel.createdAt).toBeInstanceOf(Date);
    expect(novel.lastEdited).toBeInstanceOf(Date);
    expect(novel.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(novel.createdAt.getTime()).toBeLessThanOrEqual(after);

    // 未填的可选字段不应出现
    expect(novel.author).toBeUndefined();
    expect(novel.description).toBeUndefined();
    expect(novel.alternateTitles).toBeUndefined();
    expect(novel.tags).toBeUndefined();
    expect(novel.webUrl).toBeUndefined();
    expect(novel.cover).toBeUndefined();
    expect(novel.volumes).toBeUndefined();
    expect(novel.translationInstructions).toBeUndefined();
    expect(novel.polishInstructions).toBeUndefined();
    expect(novel.proofreadingInstructions).toBeUndefined();
  });

  it('每次调用生成不同的 UUID', () => {
    const a = buildNovelFromFormData({ title: 'A' });
    const b = buildNovelFromFormData({ title: 'B' });
    expect(a.id).not.toBe(b.id);
  });

  it('写入非空可选字段并对 author / description trim', () => {
    const novel = buildNovelFromFormData({
      title: '书名',
      alternateTitles: ['别名'],
      author: '  鲁迅  ',
      description: '  简介  ',
      tags: ['古典'],
      webUrl: ['http://x'],
      cover: { url: 'http://c' },
      volumes: [
        {
          id: 'v1',
          title: '第一卷',
        },
      ],
      translationInstructions: '保留敬语',
      polishInstructions: '润色',
      proofreadingInstructions: '校对',
    });
    expect(novel.alternateTitles).toEqual(['别名']);
    expect(novel.author).toBe('鲁迅');
    expect(novel.description).toBe('简介');
    expect(novel.tags).toEqual(['古典']);
    expect(novel.webUrl).toEqual(['http://x']);
    expect(novel.cover).toEqual({ url: 'http://c' });
    expect(novel.volumes).toHaveLength(1);
    expect(novel.translationInstructions).toBe('保留敬语');
    expect(novel.polishInstructions).toBe('润色');
    expect(novel.proofreadingInstructions).toBe('校对');
  });

  it('空字符串 / 空数组的可选字段视为未填，不写入', () => {
    const novel = buildNovelFromFormData({
      title: 'T',
      alternateTitles: [],
      author: '',
      description: '   ', // trim 后为空
      tags: [],
      webUrl: [],
      volumes: [],
    });
    expect(novel.alternateTitles).toBeUndefined();
    expect(novel.author).toBeUndefined();
    expect(novel.description).toBeUndefined();
    expect(novel.tags).toBeUndefined();
    expect(novel.webUrl).toBeUndefined();
    expect(novel.volumes).toBeUndefined();
  });

  it('空字符串的 translationInstructions 仍会写入（因为仅用 !== undefined 判断）', () => {
    const novel = buildNovelFromFormData({
      title: 'T',
      translationInstructions: '',
      polishInstructions: '',
      proofreadingInstructions: '',
    });
    expect(novel.translationInstructions).toBe('');
    expect(novel.polishInstructions).toBe('');
    expect(novel.proofreadingInstructions).toBe('');
  });
});

describe('buildNovelUpdatesFromFormData', () => {
  it('最小输入时返回 title + 刷新后的 lastEdited', () => {
    const before = Date.now();
    const updates = buildNovelUpdatesFromFormData({ title: 'T' });
    const after = Date.now();

    expect(updates.title).toBe('T');
    expect(updates.lastEdited).toBeInstanceOf(Date);
    expect((updates.lastEdited as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((updates.lastEdited as Date).getTime()).toBeLessThanOrEqual(after);

    expect(updates.author).toBeUndefined();
    expect(updates.description).toBeUndefined();
    expect(updates.tags).toBeUndefined();
    expect(updates.webUrl).toBeUndefined();
    expect(updates.alternateTitles).toBeUndefined();
    expect(updates.cover).toBeUndefined();
    expect(updates.volumes).toBeUndefined();
  });

  it('非空字段全部写入并 trim author / description', () => {
    const updates = buildNovelUpdatesFromFormData({
      title: 'T',
      alternateTitles: ['别名'],
      author: '  张三  ',
      description: '  描述  ',
      tags: ['奇幻'],
      webUrl: ['http://x'],
      cover: { url: 'http://c' },
      volumes: [],
      translationInstructions: 'TI',
      polishInstructions: 'PI',
      proofreadingInstructions: 'PRI',
    });
    expect(updates.alternateTitles).toEqual(['别名']);
    expect(updates.author).toBe('张三');
    expect(updates.description).toBe('描述');
    expect(updates.tags).toEqual(['奇幻']);
    expect(updates.webUrl).toEqual(['http://x']);
    // cover !== undefined 时会写入
    expect(updates.cover).toEqual({ url: 'http://c' });
    // volumes !== undefined（即使为空数组）也会写入
    expect(updates.volumes).toEqual([]);
    expect(updates.translationInstructions).toBe('TI');
    expect(updates.polishInstructions).toBe('PI');
    expect(updates.proofreadingInstructions).toBe('PRI');
  });

  it('显式清空的 author / description 写回空字符串（让用户能清掉已有值）', () => {
    const updates = buildNovelUpdatesFromFormData({
      title: 'T',
      author: '   ',
      description: '',
    });
    expect('author' in updates).toBe(true);
    expect(updates.author).toBe('');
    expect('description' in updates).toBe(true);
    expect(updates.description).toBe('');
  });

  it('显式清空的 alternateTitles / tags / webUrl 写回空数组（让用户能清掉已有值）', () => {
    const updates = buildNovelUpdatesFromFormData({
      title: 'T',
      alternateTitles: [],
      tags: [],
      webUrl: [],
    });
    expect(updates.alternateTitles).toEqual([]);
    expect(updates.tags).toEqual([]);
    expect(updates.webUrl).toEqual([]);
  });

  it('未在表单提供的字段保持 undefined（不写回）', () => {
    const updates = buildNovelUpdatesFromFormData({ title: 'T' });
    expect('author' in updates).toBe(false);
    expect('description' in updates).toBe(false);
    expect('tags' in updates).toBe(false);
    expect('webUrl' in updates).toBe(false);
    expect('alternateTitles' in updates).toBe(false);
  });

  it('cover === undefined 不写入；cover 为 null 也视为已定义写入（undefined 检查而非 falsy）', () => {
    const noCover = buildNovelUpdatesFromFormData({ title: 'T' });
    expect('cover' in noCover).toBe(false);

    const withNullCover = buildNovelUpdatesFromFormData({
      title: 'T',
      cover: null as unknown as Novel['cover'],
    });
    expect('cover' in withNullCover).toBe(true);
    expect(withNullCover.cover).toBeNull();
  });

  it('空字符串 instructions 仍写入（!== undefined）', () => {
    const updates = buildNovelUpdatesFromFormData({
      title: 'T',
      translationInstructions: '',
      polishInstructions: '',
      proofreadingInstructions: '',
    });
    expect(updates.translationInstructions).toBe('');
    expect(updates.polishInstructions).toBe('');
    expect(updates.proofreadingInstructions).toBe('');
  });
});
