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
 * 解析和验证 JSON 响应（带状态字段）
 * 支持简化格式：s=status, p=paragraphs, i=index, t=translation, tt=titleTranslation
 * @param responseText AI 返回的文本
 * @param paragraphIds 可选的段落 ID 列表，用于将索引映射回实际 ID
 * @returns 解析后的结果，包含状态和内容
 */
export function parseStatusResponse(responseText: string, paragraphIds?: string[]): ParsedResponse {
  try {
    // 尝试提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: 'working',
        error: '响应中未找到 JSON 格式',
      };
    }

    const jsonStr = jsonMatch[0];
    const data = JSON.parse(jsonStr);

    // 验证状态字段（支持 s 或 status）
    const statusValue = data.s ?? data.status;
    if (!statusValue || typeof statusValue !== 'string') {
      return {
        status: 'working',
        error: 'JSON 中缺少 status/s 字段',
      };
    }

    const status = statusValue;
    const validStatuses: TaskStatus[] = ['planning', 'working', 'review', 'end'];

    if (!validStatuses.includes(status as TaskStatus)) {
      return {
        status: 'working',
        error: `无效的状态值: ${status}，必须是 planning、working、review 或 end 之一`,
      };
    }

    // 提取内容（如果有）- 支持简化格式
    const content: ParsedResponse['content'] = {};

    // 解析段落（支持 p 或 paragraphs）
    const paragraphsData = data.p ?? data.paragraphs;
    if (paragraphsData && Array.isArray(paragraphsData)) {
      content.paragraphs = paragraphsData.map(
        (item: { i?: number; id?: string; t?: string; translation?: string }) => {
          // 支持简化格式 (i, t) 和完整格式 (id, translation)
          let id: string;
          if (typeof item.i === 'number' && paragraphIds && paragraphIds[item.i] !== undefined) {
            // 使用索引映射回实际 ID
            id = paragraphIds[item.i] as string;
          } else if (typeof item.id === 'string') {
            // 直接使用 ID
            id = item.id;
          } else if (typeof item.i === 'number') {
            // 没有映射表时，将索引转为字符串作为临时 ID
            id = String(item.i);
          } else {
            id = '';
          }
          const translation = item.t ?? item.translation ?? '';
          return { id, translation };
        },
      );
    }

    // 解析标题翻译（支持 tt 或 titleTranslation）
    const titleValue = data.tt ?? data.titleTranslation;
    if (titleValue && typeof titleValue === 'string') {
      content.titleTranslation = titleValue;
    }

    return {
      status: status as TaskStatus,
      content: Object.keys(content).length > 0 ? content : undefined,
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
