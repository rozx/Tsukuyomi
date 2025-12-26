import './setup';
import { describe, test, expect } from 'bun:test';
import { buildBookContextSectionFromBook } from 'src/services/ai/tasks/utils/ai-task-helper';

describe('buildBookContextSectionFromBook', () => {
  test('无任何书籍信息时返回空字符串', () => {
    expect(buildBookContextSectionFromBook({})).toBe('');
    expect(buildBookContextSectionFromBook({ title: '   ' })).toBe('');
    expect(buildBookContextSectionFromBook({ description: '   ' })).toBe('');
    expect(buildBookContextSectionFromBook({ tags: [] })).toBe('');
  });

  test('包含书名/简介/标签时，输出包含对应字段（标签使用顿号分隔）', () => {
    const s = buildBookContextSectionFromBook({
      title: '我的书',
      description: '这是简介',
      tags: ['恋爱', '校园'],
    });

    expect(s).toContain('【书籍信息】');
    expect(s).toContain('**书名**: 我的书');
    expect(s).toContain('**简介**: 这是简介');
    expect(s).toContain('**标签**: 恋爱、校园');
  });

  test('简介过长时会被截断并标记已截断', () => {
    const longDesc = 'a'.repeat(650);
    const s = buildBookContextSectionFromBook({
      title: '书名',
      description: longDesc,
    });

    expect(s).toContain('**书名**: 书名');
    expect(s).toContain('**简介**: ');
    expect(s).toContain('...(已截断)');
    // 截断长度应小于原始长度（留出标记）
    expect(s.length).toBeLessThan(longDesc.length + 100);
  });

  test('tags 中空白项会被过滤', () => {
    const s = buildBookContextSectionFromBook({
      title: '书名',
      tags: ['  ', '奇幻', '', '冒险'],
    });
    expect(s).toContain('**标签**: 奇幻、冒险');
  });
});


