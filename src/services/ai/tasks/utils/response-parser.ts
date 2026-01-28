import type { TaskStatus } from './task-types';

/**
 * 解析后的 JSON 响应结果
 */
export interface ParsedResponse {
  status: TaskStatus;
  content?:
    | {
        paragraphs?: Array<{ id: string; translation: string }>;
        titleTranslation?: string;
      }
    | undefined;
  error?: string | undefined;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  allComplete: boolean;
  missingIds: string[];
}

/**
 * 提取字符串中的 JSON 对象（支持不规范的流式输出）
 * 使用简单的括号计数算法，比正则更稳健，可以处理 JSON 对象之间的无关文本
 */
function extractJsonObjects(text: string): any[] {
  const results: any[] = [];
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Handle strings to ignore braces inside them
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    // Track braces
    if (char === '{') {
      if (braceCount === 0) startIndex = i;
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      // Found a complete object
      if (braceCount === 0 && startIndex !== -1) {
        const jsonStr = text.substring(startIndex, i + 1);
        try {
          results.push(JSON.parse(jsonStr));
        } catch {
          // Skip invalid JSON chunks
        }
        startIndex = -1;
      }
    }
  }
  return results;
}

/**
 * 解析和验证 JSON 响应（带状态字段）
 * 支持简化格式：s=status, p=paragraphs, i=index, t=translation, tt=titleTranslation
 * 支持多 JSON 对象合并（状态变更与内容分离）
 * @param responseText AI 返回的文本
 * @param paragraphIds 可选的段落 ID 列表，用于将索引映射回实际 ID
 * @returns 解析后的结果，包含状态和内容
 */
export function parseStatusResponse(responseText: string, paragraphIds?: string[]): ParsedResponse {
  try {
    // 使用 robust extractor 替代 Regex，能更好处理流式输出和混合文本
    const jsonMatches = extractJsonObjects(responseText);

    if (jsonMatches.length === 0) {
      return {
        status: 'working',
        error: '响应中未找到 JSON 格式',
      };
    }

    let finalStatus: TaskStatus | undefined;
    const accumulatedContent: {
      paragraphs: Array<{ id: string; translation: string }>;
      titleTranslation?: string;
    } = { paragraphs: [] };

    let hasParsedAny = false;

    // 遍历所有找到的 JSON 对象
    for (const data of jsonMatches) {
      hasParsedAny = true;

      // 1. 提取状态 (s / status)
      const statusValue = data.s ?? data.status;
      if (statusValue && typeof statusValue === 'string') {
        const validStatuses: TaskStatus[] = ['planning', 'working', 'review', 'end'];
        if (validStatuses.includes(statusValue as TaskStatus)) {
          finalStatus = statusValue as TaskStatus;
        }
      }

      // 2. 提取内容 (p / paragraphs, tt / titleTranslation)
      const paragraphsData = data.p ?? data.paragraphs;
      if (paragraphsData && Array.isArray(paragraphsData)) {
        const parsedParas = paragraphsData.map(
          (item: { i?: number; id?: string; t?: string; translation?: string }) => {
            let id: string;
            if (typeof item.i === 'number' && paragraphIds && paragraphIds[item.i] !== undefined) {
              id = paragraphIds[item.i] as string;
            } else if (typeof item.id === 'string') {
              id = item.id;
            } else if (typeof item.i === 'number') {
              id = String(item.i);
            } else {
              id = '';
            }
            const translation = item.t ?? item.translation ?? '';
            return { id, translation };
          },
        );
        accumulatedContent.paragraphs.push(...parsedParas);
      }

      const titleValue = data.tt ?? data.titleTranslation;
      if (titleValue && typeof titleValue === 'string') {
        accumulatedContent.titleTranslation = titleValue;
      }
    }

    if (!hasParsedAny) {
      return {
        status: 'working',
        error: 'JSON 解析失败: 无法解析任何有效 JSON 对象',
      };
    }

    // 如果没有提取到任何 status，但提取到了内容，默认为 working
    if (!finalStatus) {
      if (accumulatedContent.paragraphs.length > 0 || accumulatedContent.titleTranslation) {
        finalStatus = 'working';
      } else {
        return {
          status: 'working',
          error: 'JSON 中缺少 status/s 字段',
        };
      }
    }

    return {
      status: finalStatus,
      content:
        accumulatedContent.paragraphs.length > 0 || accumulatedContent.titleTranslation
          ? accumulatedContent
          : undefined,
    };
  } catch (e) {
    return {
      status: 'working',
      error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 验证段落翻译完整性
 * @param expectedParagraphIds 期望的段落 ID 列表
 * @param receivedTranslations 已收到的翻译（段落 ID 到翻译文本的映射）
 * @returns 验证结果
 */
export function verifyParagraphCompleteness(
  expectedParagraphIds: string[],
  receivedTranslations: Map<string, string>,
): VerificationResult {
  const missingIds: string[] = [];

  for (const paraId of expectedParagraphIds) {
    if (!receivedTranslations.has(paraId)) {
      missingIds.push(paraId);
    }
  }

  return {
    allComplete: missingIds.length === 0,
    missingIds,
  };
}
