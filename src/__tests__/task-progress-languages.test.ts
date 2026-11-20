import { afterEach, describe, expect, it, vi } from 'vitest';
import './setup';
import { computed, nextTick, ref } from 'vue';
import {
  TASK_TYPE_LABELS,
  taskStatusLabel,
  taskTypeLabel,
  workflowStatusLabel,
} from '../constants/ai';
import { formatTaskDuration } from '../utils/time-utils';
import { chunkSeparatorLabel, formatThinkingMessage } from '../composables/useThinkingFormatter';
import { useAIProcessingStore, type AIProcessingTask } from '../stores/ai-processing';
import { useSettingsStore } from '../stores/settings';
import type { AppLocale } from '../models/locale';
import { useToastHistory } from '../composables/useToastHistory';
import { useToastHistoryStore } from '../stores/toast-history';

const CJK = /[㐀-鿿]/;
afterEach(() => vi.restoreAllMocks());

describe('任务类型与状态标签', () => {
  it('界面标签按语言渲染，思考流协议用的简中常量保持不变', () => {
    expect(taskTypeLabel('en-US', 'proofreading')).toBe('Proofreading');
    expect(taskTypeLabel('zh-TW', 'polish')).toBe('潤色');
    expect(taskTypeLabel('zh-CN', 'termsTranslation')).toBe('术语翻译');
    expect(TASK_TYPE_LABELS.translation).toBe('翻译');
    expect(workflowStatusLabel('en-US', 'review')).toBe('Review');
    expect(workflowStatusLabel('zh-CN', 'end')).toBe('已结束');
    expect(taskStatusLabel('en-US', 'cancelled')).toBe('Cancelled');
    expect(taskStatusLabel('zh-CN', 'thinking')).toBe('思考中');
  });

  it('未知代码原样返回', () => {
    expect(taskTypeLabel('en-US', 'unknown' as never)).toBe('unknown');
    expect(taskStatusLabel('en-US', 'weird')).toBe('weird');
  });
});

describe('任务时长', () => {
  it('默认保持简中格式，其他语言本地化', () => {
    expect(formatTaskDuration(0, 5_000)).toBe('5秒');
    expect(formatTaskDuration(0, 65_000)).toBe('1分5秒');
    expect(formatTaskDuration(0, 65_000, undefined, 'en-US')).toBe('1m 5s');
    expect(formatTaskDuration(0, 5_000, undefined, 'zh-TW')).toBe('5秒');
  });
});

describe('任务中心文案', () => {
  function flatten(value: unknown, out: string[] = []): string[] {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) flatten(child, out);
    }
    return out;
  }

  it('英文资源不含中日文字符，三种语言的键一致', async () => {
    const en = (await import('../i18n/en-US/task-queue-ui')).default.taskQueueUi;
    const zhCN = (await import('../i18n/zh-CN/task-queue-ui')).default.taskQueueUi;
    const zhTW = (await import('../i18n/zh-TW/task-queue-ui')).default.taskQueueUi;
    expect(CJK.test(flatten(en).join('|'))).toBe(false);
    const keys = (value: object) => JSON.stringify(Object.keys(value).sort());
    expect(keys(zhCN)).toBe(keys(en));
    expect(keys(zhTW)).toBe(keys(en));
  });
});

describe('AI 任务存储写入的状态说明', () => {
  it('取消任务的说明使用当前界面语言', async () => {
    useSettingsStore().settings.uiLocale = 'en-US';
    const store = useAIProcessingStore();
    const id = await store.addTask({
      type: 'translation',
      modelName: 'm',
      status: 'processing',
    });
    await store.stopTask(id);
    expect(store.activeTasks.find((t) => t.id === id)?.message).toBe('Cancelled');
  });
});

describe('思考流分块分隔条', () => {
  it('存储的简中分块标记在显示时按界面语言渲染', () => {
    const parts = formatThinkingMessage('\n\n[=== 润色块 2/5 ===]\n\n正文');
    const chunk = parts.find((p) => p.type === 'chunk-separator')!;
    expect(chunk.chunkInfo).toBe('润色块 2/5');
    expect(chunkSeparatorLabel(chunk.chunkInfo!, 'en-US')).toBe('Polishing chunk 2/5');
    expect(chunkSeparatorLabel(chunk.chunkInfo!, 'zh-CN')).toBe('润色块 2/5');
    expect(chunkSeparatorLabel(chunk.chunkInfo!, 'zh-TW')).toBe('潤色區塊 2/5');
  });

  it('无法识别的旧文本原样显示', () => {
    expect(chunkSeparatorLabel('其他块 1/2', 'en-US')).toBe('其他块 1/2');
  });
});

describe('消息历史', () => {
  it('消息历史的时间是固定标签，历史消息文本原样保留', async () => {
    useSettingsStore().settings.uiLocale = 'en-US';
    const history = useToastHistory();
    expect(history.formatTimestamp(Date.now())).toBe('Just now');
    useSettingsStore().settings.uiLocale = 'zh-CN';
    expect(history.formatTimestamp(Date.now())).toBe('刚刚');

    const store = useToastHistoryStore();
    await store.addToHistory({ severity: 'info', summary: '旧的中文摘要', detail: '旧的中文详情' });
    useSettingsStore().settings.uiLocale = 'en-US';
    expect(history.historyItems.value[0]).toMatchObject({
      summary: '旧的中文摘要',
      detail: '旧的中文详情',
    });
  });
});
