import { describe, expect, it } from 'vitest';
import {
  actionSummaryLabel,
  actionTypeLabel,
  createMessageActionFromActionInfo,
  entityTypeLabel,
  getActionDetails,
} from 'src/utils/action-info-utils';
import type { ActionDetailsContext } from 'src/utils/action-info-utils';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { Novel, Terminology, Translation } from 'src/models/novel';
import type { ActionInfo } from 'src/services/ai/tools/types';

const CJK = /[぀-ヿ㐀-鿿]/;
const revision = { counter: 1, actorId: 'a' };

function tr(id: string, translation: string): Translation {
  return { id, translation, aiModelId: 'm' };
}

function makeBook(terms: Terminology[], targetLanguage?: Novel['targetLanguage']): Novel {
  return {
    id: 'b1',
    title: '用户书名',
    createdAt: new Date(),
    lastEdited: new Date(),
    ...(targetLanguage ? { targetLanguage } : {}),
    terminologies: terms,
  } as Novel;
}

function context(book?: Novel): ActionDetailsContext {
  return {
    getBookById: (id) => (book && id === book.id ? book : undefined),
    getCurrentBookId: () => (book ? book.id : null),
  };
}

const storedAction: MessageAction = {
  type: 'create',
  entity: 'term',
  name: '用户术语',
  timestamp: Date.UTC(2026, 0, 2, 3, 4, 5),
};

describe('操作详情格式化器跟随界面语言', () => {
  it('同一条已存操作在切换界面语言后重绘固定标签，名称原样保留', () => {
    const zh = getActionDetails(storedAction, context(), 'zh-CN');
    const en = getActionDetails(storedAction, context(), 'en-US');
    const tw = getActionDetails(storedAction, context(), 'zh-TW');

    expect(zh.map((d) => d.label)).toEqual(['操作类型', '实体类型', '名称', '操作时间']);
    expect(zh[0]!.value).toBe('创建');
    expect(zh[1]!.value).toBe('术语');

    expect(en.map((d) => d.label)).toEqual(['Action type', 'Entity type', 'Name', 'Time']);
    expect(en[0]!.value).toBe('Create');
    expect(en.every((d) => !CJK.test(d.label))).toBe(true);
    expect(en.find((d) => d.label === 'Name')!.value).toBe('用户术语');

    expect(tw.map((d) => d.label)).toEqual(['操作類型', '實體類型', '名稱', '操作時間']);
    expect(tw[0]!.value).toBe('建立');
  });

  it('默认语言保持简中，兼容既有两参数调用', () => {
    expect(getActionDetails(storedAction, context())[0]).toEqual({
      label: '操作类型',
      value: '创建',
    });
  });

  it('完整说明类操作只重绘自有标签，存储的说明与详情保持原文', () => {
    const action: MessageAction = {
      type: 'update',
      entity: 'book',
      name: '历史说明文本',
      nameIsDescription: true,
      descriptionDetails: [{ label: '草稿操作', value: '旧的自由文本' }],
      timestamp: 0,
    };
    const en = getActionDetails(action, context(), 'en-US');
    expect(en[0]).toEqual({ label: 'Description', value: '历史说明文本' });
    expect(en[1]).toEqual({ label: '草稿操作', value: '旧的自由文本' });
    expect(en[2]!.label).toBe('Time');
  });

  it('批量问答计数与题号按界面语言显示', () => {
    const action: MessageAction = {
      type: 'ask',
      entity: 'user',
      tool_name: 'ask_user_batch',
      batch_questions: ['问题一', '问题二'],
      batch_answers: [{ question_index: 1, answer: '回答' }],
      timestamp: 0,
    };
    const en = getActionDetails(action, context(), 'en-US');
    expect(en).toContainEqual({ label: 'Questions', value: '2 questions' });
    expect(en).toContainEqual({ label: 'Question 2', value: '问题二 → 回答' });
    const zh = getActionDetails(action, context(), 'zh-CN');
    expect(zh).toContainEqual({ label: '问题数量', value: '2 题' });
    expect(zh).toContainEqual({ label: '第 2 题', value: '问题二 → 回答' });
  });

  it('批量替换的是/否与计数随语言变化', () => {
    const action: MessageAction = {
      type: 'update',
      entity: 'translation',
      tool_name: 'batch_replace_translations',
      replaced_paragraph_count: 3,
      replace_all_translations: true,
      keywords: ['甲', '乙'],
      timestamp: 0,
    };
    const en = getActionDetails(action, context(), 'en-US');
    expect(en).toContainEqual({ label: 'Paragraphs replaced', value: '3' });
    expect(en).toContainEqual({ label: 'Replace all versions', value: 'Yes' });
    expect(en).toContainEqual({ label: 'Translation keywords', value: '甲, 乙' });
    const zh = getActionDetails(action, context(), 'zh-CN');
    expect(zh).toContainEqual({ label: '替换段落数', value: '3 个' });
    expect(zh).toContainEqual({ label: '翻译关键词', value: '甲、乙' });
  });

  it('操作与实体标签辅助函数', () => {
    expect(actionTypeLabel('en-US', 'web_search')).toBe('Web search');
    expect(entityTypeLabel('zh-TW', 'help_doc')).toBe('說明文件');
    expect(actionSummaryLabel('zh-CN', 'create', 'term')).toBe('创建术语');
    expect(actionSummaryLabel('en-US', 'create', 'term')).toBe('Create term');
  });
});

describe('术语/角色译名按操作语言读取', () => {
  const multi: Terminology = {
    id: 't1',
    name: '勇者',
    translation: tr('legacy', '勇者（简中投影）'),
    translationsByLanguage: {
      'zh-CN': { value: tr('z', '勇者（简中投影）'), revision, updatedAt: 1 },
      'en-US': { value: tr('e', 'Hero'), revision, updatedAt: 1 },
    },
  } as Terminology;

  it('使用操作携带的目标语言', () => {
    const action: MessageAction = { ...storedAction, name: '勇者', language: 'en-US' };
    const details = getActionDetails(action, context(makeBook([multi])), 'en-US');
    expect(details).toContainEqual({ label: 'Translation', value: 'Hero' });
  });

  it('操作没有语言时使用书籍目标语言', () => {
    const action: MessageAction = { ...storedAction, name: '勇者' };
    const details = getActionDetails(action, context(makeBook([multi], 'en-US')), 'zh-CN');
    expect(details).toContainEqual({ label: '翻译', value: 'Hero' });
  });

  it('多语言实体缺少该语言时不显示其他语言的译名', () => {
    const action: MessageAction = { ...storedAction, name: '勇者', language: 'zh-TW' };
    const details = getActionDetails(action, context(makeBook([multi])), 'zh-CN');
    expect(details.some((d) => d.label === '翻译')).toBe(false);
  });

  it('只有旧版单值译名时回退旧值', () => {
    const legacy = { id: 't2', name: '魔王', translation: tr('l', 'Demon King') } as Terminology;
    const action: MessageAction = { ...storedAction, name: '魔王', language: 'en-US' };
    const details = getActionDetails(action, context(makeBook([legacy])), 'en-US');
    expect(details).toContainEqual({ label: 'Translation', value: 'Demon King' });
  });

  it('创建 MessageAction 时记录执行目标语言', () => {
    const info: ActionInfo = {
      type: 'create',
      entity: 'term',
      data: { id: 't1', name: '勇者' } as Terminology,
      execution: { bookId: 'b1', languages: { uiLocale: 'zh-CN', targetLanguage: 'en-US' } },
    };
    expect(createMessageActionFromActionInfo(info).language).toBe('en-US');
  });
});
