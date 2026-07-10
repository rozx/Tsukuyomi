/**
 * buildNovelSettingsUpdate（书籍级设置保存链路）回归测试：
 * - payload 按字段存在性构造 partial update——缺省字段绝不写入（防止桌面
 *   「仅章节指令」保存把书籍级设置静默重置为默认值）
 * - taskModelOverrides 正确透传
 */
import { describe, expect, it } from 'vitest';
import {
  buildNovelSettingsUpdate,
  hasChapterInstructionPayload,
  type ChapterSettingsFormData,
} from 'src/composables/book-details/chapter-settings-update';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  MIN_TASK_CHUNK_SIZE,
} from 'src/services/ai/tasks/utils/chunk-formatter';

describe('buildNovelSettingsUpdate（按字段存在性构造 partial update）', () => {
  it('payload 仅含章节指令时不产生任何书籍级字段更新', () => {
    const data: ChapterSettingsFormData = {
      translationInstructions: '章节指令',
      polishInstructions: '',
      proofreadingInstructions: '',
    };
    expect(buildNovelSettingsUpdate(data)).toEqual({});
  });

  it('空 payload 不产生任何更新', () => {
    expect(buildNovelSettingsUpdate({})).toEqual({});
  });

  it('携带全部书籍级字段时全部写入', () => {
    const data: ChapterSettingsFormData = {
      preserveIndents: false,
      normalizeSymbolsOnDisplay: true,
      normalizeTitleOnDisplay: true,
      translationChunkSize: DEFAULT_TASK_CHUNK_SIZE,
      skipAskUser: true,
      enableOriginalTextValidation: true,
      taskModelOverrides: { translation: 'model-a', proofreading: null },
    };
    expect(buildNovelSettingsUpdate(data)).toEqual({
      preserveIndents: false,
      normalizeSymbolsOnDisplay: true,
      normalizeTitleOnDisplay: true,
      translationChunkSize: DEFAULT_TASK_CHUNK_SIZE,
      skipAskUser: true,
      enableOriginalTextValidation: true,
      taskModelOverrides: { translation: 'model-a', proofreading: null },
    });
  });

  it('只携带部分字段时只更新这些字段', () => {
    const updates = buildNovelSettingsUpdate({ skipAskUser: true });
    expect(updates).toEqual({ skipAskUser: true });
    expect('preserveIndents' in updates).toBe(false);
    expect('taskModelOverrides' in updates).toBe(false);
  });

  it('taskModelOverrides 单独携带时正确写入', () => {
    const updates = buildNovelSettingsUpdate({
      taskModelOverrides: { translation: null, proofreading: 'model-b' },
    });
    expect(updates).toEqual({
      taskModelOverrides: { translation: null, proofreading: 'model-b' },
    });
  });

  it('translationChunkSize 越界值按现有规则收敛', () => {
    const updates = buildNovelSettingsUpdate({ translationChunkSize: 1 });
    expect(updates.translationChunkSize).toBe(MIN_TASK_CHUNK_SIZE);
  });
});

describe('hasChapterInstructionPayload（仅书籍级保存不得重置章节指令）', () => {
  it('payload 只含书籍级字段时为 false', () => {
    expect(hasChapterInstructionPayload({ skipAskUser: true })).toBe(false);
    expect(hasChapterInstructionPayload({})).toBe(false);
  });

  it('payload 携带任一章节指令字段（含空串）时为 true', () => {
    expect(hasChapterInstructionPayload({ translationInstructions: 'x' })).toBe(true);
    expect(hasChapterInstructionPayload({ polishInstructions: '' })).toBe(true);
    expect(hasChapterInstructionPayload({ proofreadingInstructions: '' })).toBe(true);
  });
});
