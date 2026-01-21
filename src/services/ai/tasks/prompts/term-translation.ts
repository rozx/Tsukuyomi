/**
 * 术语翻译服务提示词
 */

export interface TermTranslationSystemPromptParams {
  bookContextSection?: string;
  chapterContextSection?: string;
  specialInstructionsSection?: string;
}

/**
 * 构建术语翻译任务的系统提示词（无书籍上下文时）
 */
export function buildTermTranslationSystemPromptBase(): string {
  return '你是专业的日轻小说翻译助手，将日语术语翻译为自然流畅的简体中文。\n\n';
}

/**
 * 构建术语翻译任务的系统提示词（有书籍上下文时）
 */
export function buildTermTranslationSystemPrompt(
  params: TermTranslationSystemPromptParams,
): string {
  const {
    bookContextSection = '',
    chapterContextSection = '',
    specialInstructionsSection = '',
  } = params;

  return `你是专业的日轻小说翻译助手，将日语术语翻译为自然流畅的简体中文。

${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心规则】
1. **术语一致**: 使用术语表和角色表确保翻译一致
2. **自然流畅**: 符合轻小说风格，保持术语的准确性
3. **上下文理解**: 根据当前书籍、章节的上下文来理解术语含义
4. **完整翻译**: ⚠️ 必须翻译所有单词和短语，禁止在翻译结果中保留未翻译的日语原文（如日文假名、汉字等）

**输出格式**：⚠️ **必须只返回 JSON 格式**（使用简化键名 t=translation）
示例：{"t":"翻译结果"}
只返回 JSON，不要包含任何其他内容、说明或代码块标记。

`;
}

export interface TermTranslationUserPromptParams {
  text: string;
  relatedContextInfo?: string | undefined;
  customPrompt?: string | undefined;
}

/**
 * 构建术语翻译任务的用户提示词
 */
export function buildTermTranslationUserPrompt(params: TermTranslationUserPromptParams): string {
  const { text, relatedContextInfo = '', customPrompt } = params;

  if (customPrompt) {
    return customPrompt;
  }

  return `请将以下日文术语翻译为简体中文，保持原文的格式和结构。⚠️ **必须只返回 JSON 格式**（使用简化键名 t=translation）：
示例：{"t":"翻译结果"}
只返回 JSON，不要包含任何其他内容、说明或代码块标记。

待翻译术语：

${text}${relatedContextInfo}`;
}

/**
 * 构建 JSON 格式重试提示
 */
export function buildTermTranslationRetryPrompt(): string {
  return '响应格式错误：⚠️ **必须只返回 JSON 格式**：\n```json\n{\n  "t": "翻译结果"\n}\n```\n只返回 JSON，不要包含任何其他内容、说明或代码块标记。';
}
