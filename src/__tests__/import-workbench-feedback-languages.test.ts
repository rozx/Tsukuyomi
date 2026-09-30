import { describe, expect, it } from 'vitest';
import './setup';
import { importPlanStatus } from '../composables/import-page/import-plan-status';
import { importApplyConfirmation } from '../composables/import-page/import-apply-confirmation';
import { importDraftDeletionDetails } from '../composables/import-page/useImportDraftDeletion';
import {
  importApplicationFeedback,
  importDraftRemovalFeedback,
  importFailure,
  importPauseFeedback,
  importPlanFeedback,
  importRunFeedback,
  importSuccess,
} from '../utils/import-feedback';
import {
  importError,
  importFailure as importFailureRecord,
  serializeImportError,
} from '../services/import/import-error';
import { readableError } from '../components/import/import-labels';
import { LocalizedError } from '../utils/localized-error';
import type { ImportDraft, ImportOperation, ImportPlan, ImportTask } from '../models/import';

const CJK = /[぀-ヿ㐀-鿿]/;

function plan(partial: Partial<ImportPlan> = {}): ImportPlan {
  return {
    id: 'plan',
    draftRevision: 3,
    targetKind: 'new',
    targetBookId: 'book',
    book: { title: 'Moon Book', targetLanguage: 'zh-CN' },
    conflicts: [],
    replacements: [],
    chapters: [],
    summary: {
      selectedChapters: 2,
      insertedParagraphs: 10,
      revisedParagraphs: 1,
      movedParagraphs: 0,
      removedParagraphs: 0,
      clearedParagraphs: 1,
      clearedVersions: 2,
      hasChanges: true,
      partial: true,
    },
    recipeChange: { kind: 'add' },
    ...partial,
  } as unknown as ImportPlan;
}

describe('方案状态按界面语言显示', () => {
  it('英文界面的状态标签与说明不含中文，繁中使用繁体', () => {
    const base = { draftRevision: 3, applied: false, blocked: '' };
    for (const input of [
      { ...base, plan: null },
      { ...base, plan: plan() },
      { ...base, plan: plan(), applied: true },
      { ...base, plan: plan({ draftRevision: 2 }) },
      { ...base, plan: plan({ conflicts: [importFailureRecord('X', 'undoAlready')] }) },
    ]) {
      const en = importPlanStatus({ ...input, locale: 'en-US' });
      expect(`${en.label}\n${en.message}`).not.toMatch(CJK);
    }
    const tw = importPlanStatus({ ...base, plan: plan(), locale: 'zh-TW' });
    expect(tw.label).toBe('可以匯入');
    expect(importPlanStatus({ ...base, plan: plan() }).label).toBe('可以导入');
  });
});

describe('工作台通知按界面语言显示', () => {
  it('成功、失败、方案、运行与暂停通知在英文界面不含中文固定文字', () => {
    const texts = (value: { summary: string; detail?: string } | undefined) =>
      value ? `${value.summary}\n${value.detail ?? ''}` : '';
    const operation = {
      state: 'applied',
      pendingMaintenance: [],
      plan: plan(),
    } as unknown as ImportOperation;
    const outputs = [
      texts(importSuccess('create', 'en-US')),
      texts(importSuccess('add-source', 'en-US')),
      texts(importFailure('apply', 'PLAN_STALE: boom', 'en-US')),
      texts(importDraftRemovalFeedback({ op: 'clear_structure' }, 'en-US')),
      texts(importApplicationFeedback(operation, 'en-US')),
      texts(importApplicationFeedback({ ...operation, state: 'reverted' }, 'en-US')),
      texts(importPlanFeedback(plan(), 'en-US')),
      texts(importRunFeedback({ state: 'ready' } as ImportTask, 'en-US')),
      texts(importRunFeedback({ state: 'waiting_user' } as ImportTask, 'en-US')),
      texts(importPauseFeedback({ state: 'pausing' } as ImportTask, 'en-US')),
      texts(importPauseFeedback({ state: 'paused' } as ImportTask, 'en-US')),
    ];
    expect(outputs.filter((text) => CJK.test(text))).toEqual([]);
    expect(importFailure('apply', 'boom', 'en-US').detail).toBe('boom');
    expect(importSuccess('create', 'zh-TW')?.summary).toBe('匯入任務已建立');
    expect(importSuccess('create')?.summary).toBe('导入任务已创建');
  });

  it('任务失败通知按界面语言重新投影自有错误，旧记录纯文字保持原样', () => {
    const failed = (lastError: unknown) =>
      importRunFeedback({ state: 'failed', lastError } as ImportTask, 'en-US');
    expect(failed(importFailureRecord('UNDO', 'undoAlready'))?.detail).not.toMatch(CJK);
    expect(failed({ code: 'OLD', message: '旧记录' })?.detail).toBe('旧记录');
    expect(failed(undefined)?.detail).not.toMatch(CJK);
  });
});

describe('新书最终确认显示目标语言', () => {
  it('新建书籍使用界面语言作为目标，按界面语言显示语言名', () => {
    const en = importApplyConfirmation(plan(), 'en-US');
    expect(en.targetLanguage).toBe('en-US');
    expect(en.message).toContain('English');
    expect(`${en.header}\n${en.message}\n${en.acceptLabel}\n${en.rejectLabel}`).not.toMatch(CJK);
    const tw = importApplyConfirmation(plan(), 'zh-TW');
    expect(tw.targetLanguage).toBe('zh-TW');
    expect(tw.message).toContain('繁體中文');
    expect(tw.message).toContain('《Moon Book》');
  });

  it('更新已有书籍沿用书籍目标语言，语言名与界面语言无关地正确显示', () => {
    const existing = plan({
      targetKind: 'existing',
      book: { title: 'Moon Book', targetLanguage: 'zh-TW' },
    } as Partial<ImportPlan>);
    const en = importApplyConfirmation(existing, 'en-US');
    expect(en.targetLanguage).toBe('zh-TW');
    expect(en.message).toContain('Traditional Chinese');
    const cn = importApplyConfirmation(existing, 'zh-CN');
    expect(cn.message).toContain('繁体中文');
    expect(cn.message).toContain('更新《Moon Book》：2 章。');
    expect(cn.message).toBe(
      '更新《Moon Book》：2 章。译文目标语言：繁体中文。将清空 1 段原文已修订段落的 2 个译文版本。' +
        '这是部分导入，缺失或完整性未确认的章节不会被处理。同时写入更新配方。' +
        '确认后才会写入书库，可在书籍没有后续修改前整次撤销。',
    );
    expect(en.message).toContain('. Translation target language: Traditional Chinese. ');
  });
});

describe('草稿删除确认按界面语言显示', () => {
  it('英文界面的删除确认不含中文固定文字，繁中使用繁体', () => {
    const draft = {
      volumes: [{ id: 'v', title: 'Vol A' }],
      chapters: [{ id: 'c', title: 'Ch A', volumeId: 'v' }],
    } as unknown as ImportDraft;
    for (const removal of [
      { op: 'remove_chapter', chapterId: 'c' },
      { op: 'remove_volume', volumeId: 'v' },
      { op: 'clear_structure' },
    ] as const) {
      const en = importDraftDeletionDetails(draft, removal, 'en-US')!;
      expect(`${en.header}\n${en.message}\n${en.acceptLabel}`).not.toMatch(CJK);
    }
    expect(importDraftDeletionDetails(draft, { op: 'clear_structure' }, 'zh-TW')?.header).toBe(
      '清空全部卷章草稿',
    );
  });
});

describe('工作台错误说明按界面语言显示', () => {
  it('带身份的失败记录重新投影，旧记录纯文字与外部诊断保持原样', () => {
    const record = serializeImportError(importError('UNDO_ALREADY', 'undoAlready'));
    expect(readableError(record, 'en-US')).not.toMatch(CJK);
    expect(readableError(record, 'zh-TW')).toBe('這次匯入已復原。');
    expect(readableError('LEGACY: 旧记录文字', 'en-US')).toBe('旧记录文字');
    expect(readableError(serializeImportError(new Error('remote 503')), 'zh-TW')).toBe(
      'remote 503',
    );
  });

  it('抓取与爬虫自有错误保存到来源后，按查看时的界面语言显示', () => {
    const stored = serializeImportError(
      new LocalizedError('FETCH_EMPTY_RESPONSE', 'bookUi.fetch.emptyResponse'),
      'SOURCE_FAILED',
    );
    expect(stored.code).toBe('FETCH_EMPTY_RESPONSE');
    const en = readableError(stored, 'en-US');
    expect(en).not.toMatch(CJK);
    expect(en).not.toMatch(/^FETCH_EMPTY_RESPONSE/);
    expect(readableError(stored, 'zh-CN')).toMatch(/[\u4e00-\u9fff]/);
  });
});
