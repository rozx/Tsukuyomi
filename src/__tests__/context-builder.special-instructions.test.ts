import { describe, expect, it } from 'vitest';
import { resolveSpecialInstructionsForTask } from 'src/services/ai/tasks/utils/context-builder';
import type { Novel, Chapter } from 'src/models/novel';
import type { TaskType } from 'src/services/ai/tasks/utils/task-types';

function makeBook(overrides: Partial<Novel> = {}): Novel {
  return {
    id: 'b1',
    title: 'Book',
    lastEdited: new Date(0),
    createdAt: new Date(0),
    ...overrides,
  };
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return { id: 'c1', ...overrides } as Chapter;
}

describe('resolveSpecialInstructionsForTask', () => {
  it('章节级指令覆盖书籍级（translation / polish / proofreading）', () => {
    const book = makeBook({
      translationInstructions: 'book-t',
      polishInstructions: 'book-p',
      proofreadingInstructions: 'book-pr',
    });
    const chapter = makeChapter({
      translationInstructions: 'chap-t',
      polishInstructions: 'chap-p',
      proofreadingInstructions: 'chap-pr',
    });
    expect(resolveSpecialInstructionsForTask(book, chapter, 'translation')).toBe('chap-t');
    expect(resolveSpecialInstructionsForTask(book, chapter, 'polish')).toBe('chap-p');
    expect(resolveSpecialInstructionsForTask(book, chapter, 'proofreading')).toBe('chap-pr');
  });

  it('章节无指令（或章节缺省）时回退到书籍级', () => {
    const book = makeBook({
      translationInstructions: 'book-t',
      polishInstructions: 'book-p',
      proofreadingInstructions: 'book-pr',
    });
    expect(resolveSpecialInstructionsForTask(book, makeChapter(), 'translation')).toBe('book-t');
    expect(resolveSpecialInstructionsForTask(book, undefined, 'polish')).toBe('book-p');
    expect(resolveSpecialInstructionsForTask(book, undefined, 'proofreading')).toBe('book-pr');
  });

  it('章节指令为空串时回退到书籍级（|| 语义）', () => {
    const book = makeBook({ translationInstructions: 'book-t' });
    const chapter = makeChapter({ translationInstructions: '' });
    expect(resolveSpecialInstructionsForTask(book, chapter, 'translation')).toBe('book-t');
  });

  it('未知任务类型返回 undefined', () => {
    const book = makeBook({ translationInstructions: 'book-t' });
    expect(
      resolveSpecialInstructionsForTask(book, makeChapter(), 'assistant' as TaskType),
    ).toBeUndefined();
  });

  it('书籍与章节均无指令时返回 undefined', () => {
    expect(
      resolveSpecialInstructionsForTask(makeBook(), makeChapter(), 'translation'),
    ).toBeUndefined();
  });
});
