import type { AITool, AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ActionInfo } from './types';
import { terminologyTools } from './terminology-tools';
import { characterTools } from './character-tools';
import { paragraphTools } from './paragraph-tools';
import { webSearchTools } from './web-search-tools';
import { bookTools } from './book-tools';
import { memoryTools } from './memory-tools';

export type { ActionInfo };

export class ToolRegistry {
  static getTerminologyTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return terminologyTools.map((t) => t.definition);
  }

  static getCharacterSettingTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return characterTools.map((t) => t.definition);
  }

  static getParagraphTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return paragraphTools.map((t) => t.definition);
  }

  static getBookTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return bookTools.map((t) => t.definition);
  }

  static getMemoryTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return memoryTools.map((t) => t.definition);
  }

  static getWebSearchTools(): AITool[] {
    return webSearchTools.map((t) => t.definition);
  }

  static getAllTools(bookId?: string): AITool[] {
    const tools: AITool[] = [
      // 网络搜索工具始终可用（不需要 bookId）
      ...this.getWebSearchTools(),
    ];

    // 其他工具需要 bookId
    if (bookId) {
      tools.push(
        ...this.getTerminologyTools(bookId),
        ...this.getCharacterSettingTools(bookId),
        ...this.getParagraphTools(bookId),
        ...this.getBookTools(bookId),
        ...this.getMemoryTools(bookId),
      );
    }

    return tools;
  }

  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
    onAction?: (action: ActionInfo) => void,
  ): Promise<AIToolCallResult> {
    const functionName = toolCall.function.name;
    const allTools = [
      ...terminologyTools,
      ...characterTools,
      ...paragraphTools,
      ...webSearchTools,
      ...bookTools,
      ...memoryTools,
    ];
    const tool = allTools.find((t) => t.definition.function.name === functionName);

    if (!tool) {
      console.warn(`[ToolRegistry] ⚠️ 未知的工具: ${functionName}`);
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify({
          success: false,
          error: `未知的工具: ${functionName}`,
        }),
      };
    }

    try {
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        const errorMsg = `无法解析工具参数: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[ToolRegistry] ❌ 工具调用失败 [${functionName}]:`, errorMsg);
        throw new Error(errorMsg);
      }

      // 记录工具调用开始
      const argsPreview = JSON.stringify(args);
      const argsDisplay =
        argsPreview.length > 200 ? argsPreview.substring(0, 200) + '...' : argsPreview;
      console.log(
        `[ToolRegistry] 🔧 AI 调用工具: ${functionName}${bookId ? ` (bookId: ${bookId})` : ''}`,
        argsDisplay,
      );

      // 网络搜索工具不需要 bookId
      const result = await tool.handler(args, {
        ...(bookId ? { bookId } : {}),
        ...(onAction ? { onAction } : {}),
      });

      // 记录工具调用成功
      const resultPreview =
        typeof result === 'string'
          ? result.length > 200
            ? result.substring(0, 200) + '...'
            : result
          : JSON.stringify(result).length > 200
            ? JSON.stringify(result).substring(0, 200) + '...'
            : JSON.stringify(result);
      console.log(`[ToolRegistry] ✅ 工具调用成功 [${functionName}]:`, resultPreview);

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error(`[ToolRegistry] ❌ 工具调用失败 [${functionName}]:`, errorMsg);
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify({
          success: false,
          error: errorMsg,
        }),
      };
    }
  }
}
