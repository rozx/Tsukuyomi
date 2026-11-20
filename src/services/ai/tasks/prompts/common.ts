import { taskPromptLabel, statusCall } from './runner';
import type { AppLocale, ExecutionLanguages } from 'src/models/locale';
import { captureExecutionLanguages } from '../utils/execution-languages';
import { aiLanguageName } from './language';
import { agentText } from 'src/i18n/translate';
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
export function getToolScopeRules(tools?: AITool[]): string {
  const names = tools?.map((tool) => tool.function.name) ?? [];
  const list = names.length
    ? names.map((name) => `- \`${name}\``).join('\n')
    : agentText('aiCommon.noTools');
  return agentText('aiCommon.scope', { tools: list });
}

/**
 * 获取全角符号格式规则（精简版）
 */
export function getSymbolFormatRules(targetLanguage: AppLocale = 'zh-CN'): string {
  return [
    agentText(targetLanguage === 'en-US' ? 'aiText.symbolEnglish' : 'aiText.symbolChinese'),
    agentText('aiText.preserveFormat'),
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
): string {
  if (status === 'planning' || status === 'preparing')
    return agentText(
      brief ? 'aiState.brief' : 'aiState.planning',
      brief
        ? { transition: statusCall('working') }
        : { task: taskPromptLabel(taskType), transition: statusCall('working') },
    );
  if (status === 'working')
    return agentText('aiState.working', {
      task: taskPromptLabel(taskType),
      focus: agentText(
        taskType === 'translation'
          ? 'aiState.focusTranslation'
          : taskType === 'polish'
            ? 'aiState.focusPolish'
            : 'aiState.focusProofread',
      ),
      maintenance: taskType === 'translation' ? 'planning / review' : 'planning',
      max: MAX_TRANSLATION_BATCH_SIZE,
      changed: taskType === 'translation' ? '' : agentText('aiState.changed'),
      transition: statusCall(taskType === 'translation' ? 'review' : 'end'),
    });
  if (status === 'review') return agentText('aiState.review', { transition: statusCall('end') });
  return agentText('aiState.end', {
    next: agentText(hasNext ? 'aiState.next' : 'aiState.last'),
  });
}

/**
 * 规则的使用方。规则正文是同一份文字，只有工具名与阶段限制这些片段因使用方而异：
 * - builtin：站内翻译 / 润色 / 校对任务（有 planning / working / review 阶段）
 * - external：外部 Agent（MCP），工具名不同，没有阶段限制
 */
export type RuleAudience = 'builtin' | 'external';

/** 核心规则（准确性、段落一一对应、一致性等），按任务类型 */
export function getCoreTaskRules(
  taskType: TaskType,
  options: { single?: boolean; audience?: RuleAudience } = {},
): string {
  const audience = options.audience ?? 'builtin';
  return agentText(`aiText.core.${taskType}`, {
    scope: agentText(options.single ? 'aiText.singleScope' : 'aiText.batchScope'),
    maintain: agentText(`aiText.audience.${audience}.maintain`),
    submit: agentText(
      taskType === 'translation'
        ? `aiText.audience.${audience}.submit`
        : `aiText.audience.${audience}.submitChanged`,
    ),
  });
}

/**
 * 获取敬语处理规则（独立模块）
 * [警告] 核心规则：严禁将敬语添加为别名
 */
export function getHonorificRules(
  languages: ExecutionLanguages = captureExecutionLanguages('zh-CN'),
  audience: RuleAudience = 'builtin',
): string {
  return agentText('aiText.honorific', {
    targetLanguage: aiLanguageName(languages.targetLanguage),
    historyTool: agentText(`aiText.audience.${audience}.historyTool`),
  });
}

/** 获取数据维护规则，协议状态名称保持固定。 */
export function getDataManagementRules(audience: RuleAudience = 'builtin'): string {
  return agentText('aiText.data', {
    phases: agentText(`aiText.audience.${audience}.phases`),
    update: agentText(`aiText.audience.${audience}.update`),
  });
}

/** 获取共享记忆规则，用户内容不被重译。 */
export function getMemoryWorkflowRules(audience: RuleAudience = 'builtin'): string {
  return agentText('aiText.memory', {
    lookup: agentText(`aiText.audience.${audience}.lookup`),
    write: agentText(`aiText.audience.${audience}.write`),
  });
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
  return agentText('aiText.output', {
    statusExample: JSON.stringify({ status: '...' }),
    max: MAX_TRANSLATION_BATCH_SIZE,
    prefix: validateOriginal ? agentText('aiText.prefix') : '',
    paragraphExample,
    title: includeTitle
      ? agentText('aiText.title', {
          example: JSON.stringify({ chapter_id: 'chapter-id', title_translation: '...' }),
        })
      : '',
    flow: getTaskStateWorkflowText(taskType),
    coverage: agentText(isTranslation ? 'aiText.coverage.translation' : 'aiText.coverage.changed'),
    restriction: agentText('aiText.restriction', {
      states: isTranslation ? 'working / review' : 'working',
      max: MAX_TRANSLATION_BATCH_SIZE,
    }),
    dialogLanguage: aiLanguageName(uiLocale),
  });
}

/** 工具范围、查询与 todo 维护建议。 */
export function getToolUsageInstructions(
  taskType: TaskType,
  tools?: AITool[],
  skipAskUser?: boolean,
): string {
  return [
    getToolScopeRules(tools),
    agentText('aiText.usage', {
      query: hasQueryChapterTool(tools) ? agentText('aiText.query') : '',
      ask: skipAskUser ? '' : agentText('aiText.ask'),
      task: taskPromptLabel(taskType),
    }),
  ].join('\n\n');
}
