import type { AITool, AIToolCall, AIToolCallResult } from 'src/services/ai/types/ai-service';
import type { ActionInfo } from './types';
import { terminologyTools } from './terminology-tools';
import { characterTools } from './character-tools';
import { paragraphTools } from './paragraph-tools';

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

  static getAllTools(bookId?: string): AITool[] {
    if (!bookId) return [];
    return [
      ...this.getTerminologyTools(bookId),
      ...this.getCharacterSettingTools(bookId),
      ...this.getParagraphTools(bookId),
    ];
  }

  static async handleToolCall(
    toolCall: AIToolCall,
    bookId: string,
    onAction?: (action: ActionInfo) => void,
  ): Promise<AIToolCallResult> {
    const functionName = toolCall.function.name;
    const allTools = [...terminologyTools, ...characterTools, ...paragraphTools];
    const tool = allTools.find((t) => t.definition.function.name === functionName);

    if (!tool) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify({
          success: false,
          error: `鏈煡鐨勫伐鍏? ${functionName}`,
        }),
      };
    }

    try {
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        throw new Error(`鏃犳硶瑙ｆ瀽宸ュ叿鍙傛暟: ${e instanceof Error ? e.message : String(e)}`);
      }

      const result = await tool.handler(args, { bookId, onAction });
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: result,
      };
    } catch (error) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : '鏈煡閿欒',
        }),
      };
    }
  }
}

