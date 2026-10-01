/**
 * AI 服务相关常量
 */
import type { AppLocale } from 'src/models/locale';
import { translateText } from 'src/i18n/translate';

/**
 * 默认的上下文窗口使用比例（用于估算 maxInputTokens）
 */
const DEFAULT_CONTEXT_WINDOW_RATIO = 0.8;

/**
 * 默认的最大输出 token 数（用于配置请求）
 * 增加此值以确保配置 JSON 响应不会被截断
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 1000;

/**
 * 默认的温度值（用于配置请求）
 */
export const DEFAULT_TEMPERATURE = 0.1;

/**
 * 无限制 token 数的标识值
 */
export const UNLIMITED_TOKENS = -1;

/**
 * OpenAI 兼容 API 的 max_tokens 最大值限制
 * 当前 API 限制为 65536，但配置中允许设置更大的值（如 1M）
 * 实际发送到 API 时会自动限制到此值
 */
export const OPENAI_MAX_TOKENS_LIMIT = 65536;

/**
 * 配置中允许的最大 token 数（用于 UI 和配置）
 * 实际发送到 API 时会根据 API 限制进行限制
 */
const CONFIG_MAX_TOKENS_LIMIT = 1_000_000;

/**
 * AI 任务类型标签映射（简中）。
 *
 * 该常量写入思考流的分块标记（`[=== 翻译块 1/3 ===]`），并由思考格式化器按简中解析，
 * 属于存储协议，不随界面语言变化；界面显示请使用 {@link taskTypeLabel}。
 */
export const TASK_TYPE_LABELS: Record<
  'translation' | 'proofreading' | 'polish' | 'termsTranslation' | 'assistant' | 'config' | 'other',
  string
> = {
  translation: '翻译',
  proofreading: '校对',
  polish: '润色',
  termsTranslation: '术语翻译',
  assistant: '助手',
  config: '配置获取',
  other: '其他',
} as const;

/**
 * AI 工作流状态
 */
export type AIWorkflowStatus = 'planning' | 'preparing' | 'working' | 'review' | 'end';

/** 工作流阶段的简中标签；界面显示请使用 {@link workflowStatusLabel}。 */
const AI_WORKFLOW_STATUS_LABELS: Record<AIWorkflowStatus, string> = {
  planning: '规划阶段',
  preparing: '准备阶段',
  working: '工作阶段',
  review: '复核阶段',
  end: '已结束',
};

type TaskTypeKey = keyof typeof TASK_TYPE_LABELS;
const TASK_STATUS_CODES = ['thinking', 'processing', 'end', 'error', 'cancelled'] as const;
type TaskStatusCode = (typeof TASK_STATUS_CODES)[number];

/** 界面显示的任务类型标签（按界面语言）；未知类型原样返回。 */
export function taskTypeLabel(locale: AppLocale, type: TaskTypeKey): string {
  return type in TASK_TYPE_LABELS ? translateText(locale, `activityUi.taskType.${type}`) : type;
}

/** 界面显示的工作流阶段标签（按界面语言）；未知阶段原样返回。 */
export function workflowStatusLabel(locale: AppLocale, status: AIWorkflowStatus): string {
  return status in AI_WORKFLOW_STATUS_LABELS
    ? translateText(locale, `activityUi.workflow.${status}`)
    : status;
}

/** 界面显示的任务运行状态标签（思考中/处理中/已完成/错误/已取消）；未知状态原样返回。 */
export function taskStatusLabel(locale: AppLocale, status: string): string {
  return (TASK_STATUS_CODES as readonly string[]).includes(status)
    ? translateText(locale, `activityUi.status.${status as TaskStatusCode}`)
    : status;
}
