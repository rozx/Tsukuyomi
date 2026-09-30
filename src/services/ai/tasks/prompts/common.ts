import { taskPromptLabel, statusCall } from './runner';
import type { AppLocale } from 'src/models/locale';
import type { ExecutionLanguages } from 'src/models/locale';
import { captureExecutionLanguages } from '../utils/execution-languages';
import { aiLanguageName } from './language';
import { translateText } from 'src/i18n/translate';
import type { AITool } from 'src/services/ai/types/ai-service';
import { MAX_TRANSLATION_BATCH_SIZE } from 'src/services/ai/constants';
export { MAX_TRANSLATION_BATCH_SIZE };
import type { TaskType, TaskStatus } from '../utils/task-types';
import { getTaskStateWorkflowText } from '../utils/task-types';

/**
 * 判断本次请求是否提供了 `query_chapter` 工具。
 * 用于条件性拼接提示词里的"章节语义搜索"段落 —— 本地嵌入关闭 / 手机端时,
 * 工具集合里不会出现 query_chapter,提示词也就不该再教模型去用它。
 */
export function hasQueryChapterTool(tools?: AITool[]): boolean {
  return tools?.some((t) => t.function.name === 'query_chapter') ?? false;
}

/**
 * 工具范围规则：严格限制 AI 只能调用本次请求提供的 tools
 */
export function getToolScopeRules(tools?: AITool[], uiLocale: AppLocale = 'zh-CN'): string {
  const names = tools?.map((tool) => tool.function.name) ?? [];
  const list = names.length
    ? names.map((name) => `- \`${name}\``).join('\n')
    : translateText(uiLocale, 'aiCommon.noTools');
  return translateText(uiLocale, 'aiCommon.scope', { tools: list });
}

/**
 * 获取全角符号格式规则（精简版）
 */
export function getSymbolFormatRules(
  uiLocale: AppLocale = 'zh-CN',
  targetLanguage: AppLocale = 'zh-CN',
): string {
  return [
    translateText(
      uiLocale,
      targetLanguage === 'en-US' ? 'aiText.symbolEnglish' : 'aiText.symbolChinese',
    ),
    translateText(uiLocale, 'aiText.preserveFormat'),
  ].join('\n\n');
}

/**
 * 获取规划阶段描述
 */
export function getCurrentStatusInfo(
  taskType: TaskType,
  status: TaskStatus,
  brief?: boolean,
  hasNext?: boolean,
  locale: AppLocale = 'zh-CN',
): string {
  if (status === 'planning' || status === 'preparing')
    return translateText(
      locale,
      brief ? 'aiState.brief' : 'aiState.planning',
      brief
        ? { transition: statusCall('working') }
        : { task: taskPromptLabel(taskType, locale), transition: statusCall('working') },
    );
  if (status === 'working')
    return translateText(locale, 'aiState.working', {
      task: taskPromptLabel(taskType, locale),
      focus: translateText(
        locale,
        taskType === 'translation'
          ? 'aiState.focusTranslation'
          : taskType === 'polish'
            ? 'aiState.focusPolish'
            : 'aiState.focusProofread',
      ),
      maintenance: taskType === 'translation' ? 'planning / review' : 'planning',
      max: MAX_TRANSLATION_BATCH_SIZE,
      changed: taskType === 'translation' ? '' : translateText(locale, 'aiState.changed'),
      transition: statusCall(taskType === 'translation' ? 'review' : 'end'),
    });
  if (status === 'review')
    return translateText(locale, 'aiState.review', { transition: statusCall('end') });
  return translateText(locale, 'aiState.end', {
    next: translateText(locale, hasNext ? 'aiState.next' : 'aiState.last'),
  });
}

/**
 * 获取敬语处理规则（独立模块）
 * [警告] 核心规则：严禁将敬语添加为别名
 */
export function getHonorificRules(
  languages: ExecutionLanguages = captureExecutionLanguages('zh-CN'),
): string {
  return translateText(languages.uiLocale, 'aiText.honorific', {
    targetLanguage: aiLanguageName(languages.uiLocale, languages.targetLanguage),
  });
}

/** 获取数据维护规则，协议状态名称保持固定。 */
export function getDataManagementRules(uiLocale: AppLocale = 'zh-CN'): string {
  return translateText(uiLocale, 'aiText.data');
}

/** 获取共享记忆规则，用户内容不被重译。 */
export function getMemoryWorkflowRules(uiLocale: AppLocale = 'zh-CN'): string {
  return translateText(uiLocale, 'aiText.memory');
}

/** 工具化输出协议，JSON 示例作为插值避免被消息编译器改写。 */
export function getOutputFormatRules(
  taskType: TaskType,
  options?: {
    includeChapterTitle?: boolean;
    enableOriginalTextValidation?: boolean;
    languages?: ExecutionLanguages;
  },
): string {
  const uiLocale = options?.languages?.uiLocale ?? 'zh-CN';
  const isTranslation = taskType === 'translation';
  const includeTitle = isTranslation && (options?.includeChapterTitle ?? true);
  const validateOriginal = options?.enableOriginalTextValidation === true;
  const paragraphExample = JSON.stringify({
    paragraph_id: 'xxx',
    ...(validateOriginal ? { original_text_prefix: 'source' } : {}),
    translated_text: '...',
  });
  return translateText(uiLocale, 'aiText.output', {
    statusExample: JSON.stringify({ status: '...' }),
    max: MAX_TRANSLATION_BATCH_SIZE,
    prefix: validateOriginal ? translateText(uiLocale, 'aiText.prefix') : '',
    paragraphExample,
    title: includeTitle
      ? translateText(uiLocale, 'aiText.title', {
          example: JSON.stringify({ chapter_id: 'chapter-id', title_translation: '...' }),
        })
      : '',
    flow: getTaskStateWorkflowText(taskType),
    coverage: translateText(
      uiLocale,
      isTranslation ? 'aiText.coverage.translation' : 'aiText.coverage.changed',
    ),
    restriction: translateText(uiLocale, 'aiText.restriction', {
      states: isTranslation ? 'working / review' : 'working',
      max: MAX_TRANSLATION_BATCH_SIZE,
    }),
  });
}

/** 工具范围、查询与 todo 维护建议使用执行 UI 语言。 */
export function getToolUsageInstructions(
  taskType: TaskType,
  tools?: AITool[],
  skipAskUser?: boolean,
  uiLocale: AppLocale = 'zh-CN',
): string {
  return [
    getToolScopeRules(tools, uiLocale),
    translateText(uiLocale, 'aiText.usage', {
      query: hasQueryChapterTool(tools) ? translateText(uiLocale, 'aiText.query') : '',
      ask: skipAskUser ? '' : translateText(uiLocale, 'aiText.ask'),
      task: taskPromptLabel(taskType, uiLocale),
    }),
  ].join('\n\n');
}
