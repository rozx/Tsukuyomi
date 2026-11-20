import { describe, expect, it } from 'vitest';
import { translateText } from 'src/i18n/translate';

describe('任务队列英文文案的单复数', () => {
  it('数量为 1 时用单数，其他数量用复数', () => {
    const en = (key: Parameters<typeof translateText>[1], count: number) =>
      translateText('en-US', key, { count, kind: 'Translation' });
    expect(en('taskQueueUi.batch.resultDuplicate', 1)).toBe('1 chapter is already in the queue');
    expect(en('taskQueueUi.batch.resultDuplicate', 2)).toBe('2 chapters are already in the queue');
    expect(en('taskQueueUi.batch.resultAdded', 1)).toBe('Added 1 chapter');
    expect(en('taskQueueUi.batch.actionTranslate', 0)).toBe('Translate 0 chapters');
    expect(en('taskQueueUi.batch.actionTranslate', 1)).toBe('Translate 1 chapter');
    expect(en('taskQueueUi.batch.selectedCount', 1)).toBe('1 chapter selected');
    expect(en('taskQueueUi.batch.dialogTitle', 1)).toBe('Translation 1 chapter');
    expect(en('taskQueueUi.batch.confirm', 1)).toBe('Add 1 chapter');
    expect(en('taskQueueUi.batch.confirm', 3)).toBe('Add 3 chapters');
    expect(en('taskQueueUi.batch.notApplicable', 1)).toBe(
      '1 chapter has no translation and will be skipped',
    );
    expect(en('taskQueueUi.batch.resultNotApplicable', 1)).toBe(
      '1 chapter has no translation and was skipped',
    );
    expect(en('taskQueueUi.batch.resultNothing', 1)).toBe(
      '1 chapter needs no translation and was skipped',
    );
    expect(en('taskQueueUi.miniRunning', 1)).toBe('1 task running');
    expect(en('taskQueueUi.stoppedAll', 1)).toBe('Stopped 1 task');
  });
});
