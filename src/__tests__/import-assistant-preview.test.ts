import { describe, expect, it } from 'vitest';
import {
  buildImportAssistantPreview,
  type ImportAssistantPreviewInput,
} from 'src/composables/import-page/import-assistant-preview';

const labels = {
  question: '等你回答',
  error: '出错了',
  compacting: '正在压缩上下文',
  running: '正在整理',
  idleHint: '点这里和月詠对话',
};

const base: ImportAssistantPreviewInput = {
  stateLabel: '草稿',
  running: false,
  compacting: false,
};

describe('手机导入页的月詠预览', () => {
  it('空闲：显示任务状态与对话提示', () => {
    expect(buildImportAssistantPreview(base, labels)).toEqual({
      tone: 'idle',
      status: '草稿',
      detail: '点这里和月詠对话',
    });
  });

  it('空闲且月詠回复过：显示最近一条回复的开头（合并换行、去掉 Markdown 标记）', () => {
    const preview = buildImportAssistantPreview(
      { ...base, lastReply: '## 已整理\n\n共找到 **3** 章，要继续抓第二卷吗？' },
      labels,
    );
    expect(preview).toEqual({
      tone: 'idle',
      status: '草稿',
      detail: '已整理 共找到 3 章，要继续抓第二卷吗？',
    });
  });

  it('最近回复太长时只保留开头', () => {
    const reply = '第一卷已经整理完毕'.repeat(20);
    const preview = buildImportAssistantPreview({ ...base, lastReply: reply }, labels);
    expect(preview.detail.endsWith('…')).toBe(true);
    expect(preview.detail.length).toBeLessThanOrEqual(61);
    expect(reply.startsWith(preview.detail.slice(0, -1))).toBe(true);
  });

  it('运行中：显示正在整理与流式输出的最后一行（去掉 Markdown 标记）', () => {
    const preview = buildImportAssistantPreview(
      { ...base, running: true, streamingText: '## 检查来源\n\n- 第一卷共 **12** 章\n\n' },
      labels,
    );
    expect(preview).toEqual({ tone: 'active', status: '正在整理', detail: '第一卷共 12 章' });
  });

  it('运行中的长句只保留结尾', () => {
    const long = '正在逐章提取正文'.repeat(20);
    const preview = buildImportAssistantPreview(
      { ...base, running: true, streamingText: long },
      labels,
    );
    expect(preview.detail.startsWith('…')).toBe(true);
    expect(preview.detail.length).toBeLessThanOrEqual(61);
    expect(long.endsWith(preview.detail.slice(1))).toBe(true);
  });

  it('优先级：待回答的必答问题 > 错误 > 压缩 > 运行', () => {
    const all: ImportAssistantPreviewInput = {
      ...base,
      running: true,
      compacting: true,
      streamingText: '输出',
      error: '模型返回了空结果',
      question: '这两本是同一部作品吗？',
    };
    expect(buildImportAssistantPreview(all, labels)).toEqual({
      tone: 'attention',
      status: '等你回答',
      detail: '这两本是同一部作品吗？',
    });
    const { question: _question, ...noQuestion } = all;
    expect(buildImportAssistantPreview(noQuestion, labels)).toEqual({
      tone: 'error',
      status: '出错了',
      detail: '模型返回了空结果',
    });
    const { error: _error, ...noError } = noQuestion;
    expect(buildImportAssistantPreview(noError, labels)).toEqual({
      tone: 'active',
      status: '正在压缩上下文',
      detail: '',
    });
  });

  it('运行中还没有输出时说明为空', () => {
    expect(buildImportAssistantPreview({ ...base, running: true }, labels)).toEqual({
      tone: 'active',
      status: '正在整理',
      detail: '',
    });
  });
});
