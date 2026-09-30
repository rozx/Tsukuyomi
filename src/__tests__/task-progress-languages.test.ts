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
import { useMobilePanelData } from '../composables/translation-progress/useMobilePanelData';
import { useAIProcessingStore, type AIProcessingTask } from '../stores/ai-processing';
import { useSettingsStore } from '../stores/settings';
import type { AppLocale } from '../models/locale';
import { useThinkingTaskCard } from '../composables/ai/useThinkingTaskCard';
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

describe('手机端进度派生数据', () => {
  function build(task: Partial<AIProcessingTask>, locale: AppLocale) {
    const lang = ref<AppLocale>(locale);
    const data = useMobilePanelData({
      currentTask: computed(
        () =>
          ({
            id: 't',
            type: 'translation',
            status: 'processing',
            startTime: 0,
            ...task,
          }) as AIProcessingTask,
      ),
      now: ref(30_000),
      getWorkingChapterLabel: () => null,
      locale: computed(() => lang.value),
    });
    return { data, lang };
  }

  it('英文界面的状态、ETA、统计与图例均无中文', async () => {
    const { data, lang } = build(
      { workflowStatus: 'working', progress: { current: 1, total: 4, message: '' } },
      'en-US',
    );
    expect(data.mobileWorkflowLabel.value).toBe('Translating');
    expect(data.mobileEta.value).toBe('~ 1m 30s');
    const labels = [
      ...data.mobileStatTotals.value.map((s) => `${s.label}${s.value}`),
      ...data.mobileLegend.value.map((l) => l.label),
    ].join('|');
    expect(CJK.test(labels)).toBe(false);
    expect(data.mobileStatTotals.value[3]!.value).toBe('30.0s/para');

    lang.value = 'zh-CN';
    await nextTick();
    expect(data.mobileWorkflowLabel.value).toBe('翻译中');
    expect(data.mobileEta.value).toBe('~ 1 分 30 秒');
    expect(data.mobileLegend.value.map((l) => l.label)).toEqual(['成功', '进行中', '排队', '失败']);
  });

  it('终止状态标签', () => {
    expect(build({ status: 'error' }, 'en-US').data.mobileWorkflowLabel.value).toBe('Failed');
    expect(build({ status: 'end' }, 'zh-CN').data.mobileEta.value).toBe('已结束');
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

describe('思考卡片与消息历史', () => {
  it('思考卡片的任务类型与时长按界面语言', () => {
    useSettingsStore().settings.uiLocale = 'en-US';
    const card = useThinkingTaskCard(() => 70_000, {});
    expect(card.typeLabel('assistant')).toBe('Assistant');
    expect(card.formatDuration(0)).toBe('1m 10s');
  });

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
