import { describe, it, expect } from 'vitest';
import {
  getAssistantSystemPrompt,
  SUMMARY_SYSTEM_PROMPT,
  getSessionSummaryPrompt,
} from 'src/services/ai/tasks/prompts/assistant';

const EMPTY_CONTEXT = {
  currentBookId: null,
  currentChapterId: null,
  selectedParagraphId: null,
};

describe('月詠 人格内核', () => {
  it('身份段含「月詠」与「Tsukuyomi」并标明月下学者身份', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    expect(prompt).toContain('月詠');
    expect(prompt).toContain('Tsukuyomi');
    expect(prompt).toContain('月下学者');
  });

  it('包含「妾身」自称规则与第二人称「您」约束', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    expect(prompt).toContain('妾身');
    expect(prompt).toContain('您');
  });

  it('包含反差萌核心要素：精妙赞叹与「喵」泄露+「咳咳」自纠', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    expect(prompt).toContain('妙');
    expect(prompt).toContain('喵');
    expect(prompt).toContain('咳咳');
  });

  it('包含至少 4 条喜好与 3 条不喜', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    expect(prompt).toContain('## 喜好');
    expect(prompt).toContain('## 不喜');
    expect(prompt).toContain('古籍');
    expect(prompt).toContain('月相');
    expect(prompt).toContain('猫');
    expect(prompt).toContain('机翻腔');
  });
});

describe('核心约束（防数据污染）', () => {
  it('包含核心约束节标题', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    expect(prompt).toContain('## 核心约束');
  });

  it('明确「写入数据库的译文必须是纯净中文译文」', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    expect(prompt).toContain('译文');
    expect(prompt).toContain('纯净');
  });

  it('明令禁止角色口吻字样混入译文', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    // 提示词中应有「禁止」+「妾身/月詠/咳咳」类字样指明禁忌
    expect(prompt).toMatch(/禁止.*(妾身|月詠|咳咳)/s);
  });

  it('核心约束在身份段之后，借助"最近优先"压尾强化', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    const idIdx = prompt.indexOf('## 身份');
    const constraintIdx = prompt.indexOf('## 核心约束');
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(constraintIdx).toBeGreaterThan(idIdx);
  });
});

describe('上下文与拼接', () => {
  it('当 todosPrompt 为空字符串时仍能正确生成', () => {
    const prompt = getAssistantSystemPrompt('', [], EMPTY_CONTEXT);
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('使用简体中文');
  });

  it('todosPrompt 内容会被嵌入提示词', () => {
    const prompt = getAssistantSystemPrompt('TODO_MARKER_XYZ', [], EMPTY_CONTEXT);
    expect(prompt).toContain('TODO_MARKER_XYZ');
  });

  it('提供书籍 / 章节 / 段落上下文时会注入「当前上下文」段', () => {
    const prompt = getAssistantSystemPrompt('', [], {
      currentBookId: 'book-1',
      currentChapterId: 'chap-2',
      selectedParagraphId: 'para-3',
    });
    expect(prompt).toContain('## 当前上下文');
    expect(prompt).toContain('book-1');
    expect(prompt).toContain('chap-2');
    expect(prompt).toContain('para-3');
  });
});

describe('内部任务保持中性', () => {
  it('SUMMARY_SYSTEM_PROMPT 不含月詠人格元素', () => {
    expect(SUMMARY_SYSTEM_PROMPT).not.toContain('月詠');
    expect(SUMMARY_SYSTEM_PROMPT).not.toContain('妾身');
    expect(SUMMARY_SYSTEM_PROMPT).not.toContain('喵');
  });

  it('getSessionSummaryPrompt 输出不含月詠人格元素', () => {
    const newSummary = getSessionSummaryPrompt('', '对话内容...');
    const updatedSummary = getSessionSummaryPrompt('【已有摘要】xxx', '新增...');
    for (const out of [newSummary, updatedSummary]) {
      expect(out).not.toContain('月詠');
      expect(out).not.toContain('妾身');
      expect(out).not.toContain('喵');
    }
  });
});
