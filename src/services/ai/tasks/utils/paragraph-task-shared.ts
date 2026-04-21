import type { ParagraphExtractCallbackParams } from './text-task-processor';

/**
 * 段落变更回调 —— 仅接收翻译发生变化的段落
 */
export type ChangedParagraphsCallback = (
  translations: { id: string; translation: string }[],
) => void | Promise<void>;

/**
 * 构建 `onParagraphsExtracted` 回调的选项
 */
export interface BuildChangedParagraphsExtractCallbackOptions {
  /**
   * 用户传入的段落变更回调。若未提供，返回 `undefined`
   */
  onChangedParagraphs: ChangedParagraphsCallback | undefined;
  /**
   * 日志前缀（用于错误日志，例如 `PolishService` / `ProofreadingService`）
   */
  logLabel: string;
  /**
   * 任务中文名（用于错误日志，例如 "段落润色" / "段落校对"）
   */
  taskLabel: string;
}

/**
 * 构建统一的「提取有变化段落并透传给用户回调」的 `onParagraphsExtracted`。
 *
 * 润色 / 校对等段落级文本任务共享的模式：
 * 1. 若用户未提供回调，返回 `undefined`（由调用方决定是否注入）
 * 2. 否则对比 `paragraphs` 与 `originalTranslations`，过滤出 translation 实际发生变化的段落
 * 3. 将过滤结果交给用户回调，并在调用失败时打印统一前缀的错误日志
 */
export function buildChangedParagraphsExtractCallback(
  options: BuildChangedParagraphsExtractCallbackOptions,
):
  | ((params: ParagraphExtractCallbackParams) => Promise<void>)
  | undefined {
  const { onChangedParagraphs, logLabel, taskLabel } = options;
  if (!onChangedParagraphs) return undefined;

  return async (params: ParagraphExtractCallbackParams) => {
    const { paragraphs, originalTranslations } = params;
    // 过滤出有变化的段落（空串也视为合法的新值：用户清空翻译的场景也要通知回调）
    const changedParagraphs: { id: string; translation: string }[] = [];
    for (const para of paragraphs) {
      if (!para.id || para.translation == null) continue;
      const original = originalTranslations.get(para.id);
      if (original !== para.translation) {
        changedParagraphs.push(para);
      }
    }
    if (changedParagraphs.length > 0) {
      try {
        await Promise.resolve(onChangedParagraphs(changedParagraphs));
      } catch (error) {
        console.error(`[${logLabel}] ⚠️ ${taskLabel}回调失败:`, error);
      }
    }
  };
}
