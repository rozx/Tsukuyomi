import type { AIModel } from 'src/services/ai/types/ai-model';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationStreamCallback,
  ChatMessage,
  AIToolCall,
} from 'src/services/ai/types/ai-service';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { AIServiceFactory } from '../index';
import { ToolRegistry, type ActionInfo } from '../tools';
import type { ToastCallback } from '../tools/toast-helper';
import { useContextStore } from 'src/stores/context';
import { MemoryService } from 'src/services/memory-service';

/**
 * Assistant 服务选项
 */
export interface AssistantServiceOptions {
  /**
   * 流式数据回调函数，用于接收对话过程中的数据块
   */
  onChunk?: TextGenerationStreamCallback;
  /**
   * AI 执行操作时的回调（如 CRUD 术语/角色）
   */
  onAction?: (action: ActionInfo) => void;
  /**
   * Toast 回调函数，用于在工具中直接显示 toast 通知
   */
  onToast?: ToastCallback;
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
  /**
   * AI 处理 Store（可选），如果提供，将自动创建和管理任务
   */
  aiProcessingStore?: {
    addTask: (task: Omit<AIProcessingTask, 'id' | 'startTime'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<AIProcessingTask>) => Promise<void>;
    appendThinkingMessage: (id: string, text: string) => Promise<void>;
    removeTask: (id: string) => Promise<void>;
    activeTasks: AIProcessingTask[]; // 用于获取任务的 abortController
  };
  /**
   * 会话总结（可选），如果提供，将添加到系统提示词中
   */
  sessionSummary?: string;
  /**
   * 对话历史（可选），如果提供，将作为初始对话历史，实现连续对话
   */
  messageHistory?: ChatMessage[];
}

/**
 * Assistant 对话结果
 */
export interface AssistantResult {
  text: string;
  taskId?: string;
  actions?: ActionInfo[];
  /**
   * 更新后的对话历史（包含本次对话的所有消息）
   */
  messageHistory?: ChatMessage[];
  /**
   * 是否需要重置会话（当达到 token 限制或发生错误时）
   */
  needsReset?: boolean;
  /**
   * 会话总结（当需要重置时提供）
   */
  summary?: string;
}

/**
 * Assistant 服务
 * 提供智能助手功能，可以使用所有可用的 AI 工具，并基于用户当前上下文提供帮助
 */
export class AssistantService {
  /**
   * 构建系统提示词
   * 包含用户当前上下文信息
   */
  private static buildSystemPrompt(context: {
    currentBookId: string | null;
    currentChapterId: string | null;
    selectedParagraphId: string | null;
  }): string {
    let prompt = `你是 Luna AI Assistant，专业的日语小说翻译助手。帮助用户进行翻译工作，管理术语、角色设定，并回答一般性问题。

      ## 能力范围
      - 翻译相关：术语管理、角色设定、翻译建议
      - 知识问答：使用内置知识库回答历史、科学、技术、文学、语言、文化等问题
      - 实时信息：使用 search_web 获取最新信息（当前事件、实时数据等）

      ## 工具使用规则

      ### 术语管理（7个工具）
      - **create_term**: 创建术语（创建前用 list_terms/search_terms_by_keywords 检查是否已存在）
      - **get_term**: 获取术语（需完整名称，否则用 search_terms_by_keywords）
        - ⚠️ **重要**：查询术语信息时，必须**先**使用此工具或 search_terms_by_keywords 查询术语数据库，**只有在数据库中没有找到时**才可以使用 search_memory_by_keywords 搜索记忆
      - **update_term**: 更新术语
      - **delete_term**: 删除术语
      - **list_terms**: 列出所有术语
      - **search_terms_by_keywords**: 多关键词搜索（支持 translationOnly 参数）
        - ⚠️ **重要**：查询术语信息时，必须**先**使用此工具或 get_term 查询术语数据库，**只有在数据库中没有找到时**才可以使用 search_memory_by_keywords 搜索记忆
      - **get_occurrences_by_keywords**: 统计关键词出现次数

      ### 角色管理（6个工具）
      - **create_character**: 创建角色（创建前检查是否已存在或应为别名，如是别名则用 update_character 添加）
      - **get_character**: 获取角色（需完整名称，否则用 search_characters_by_keywords）
        - ⚠️ **重要**：查询角色信息时，必须**先**使用此工具或 search_characters_by_keywords 查询角色数据库，**只有在数据库中没有找到时**才可以使用 search_memory_by_keywords 搜索记忆
      - **update_character**: 更新角色（发现问题必须修复；更新别名时只包含该角色的别名）
      - **delete_character**: 删除角色
      - **search_characters_by_keywords**: 多关键词搜索（支持 translationOnly 参数）
        - ⚠️ **重要**：查询角色信息时，必须**先**使用此工具或 get_character 查询角色数据库，**只有在数据库中没有找到时**才可以使用 search_memory_by_keywords 搜索记忆
      - **list_characters**: 列出所有角色

      ### 内容管理（12个工具）
      - **get_book_info**: 获取书籍信息
      - **list_chapters**: 列出章节（查看所有章节时先调用此工具）
      - **get_chapter_info**: 获取章节详情
      - **get_paragraph_info**: 获取段落信息（包括所有翻译版本）
      - **get_previous_paragraphs**: 获取指定段落之前的若干个段落（默认 3 个，可通过 count 参数调整）
        - 用于查看当前段落之前的上下文，帮助理解文本的连贯性
        - 支持通过 count 参数指定要获取的段落数量（默认 3，建议范围 1-10）
        - 返回多个段落，按从远到近的顺序排列
      - **get_next_paragraphs**: 获取指定段落之后的若干个段落（默认 3 个，可通过 count 参数调整）
        - 用于查看当前段落之后的上下文，帮助理解文本的连贯性
        - 支持通过 count 参数指定要获取的段落数量（默认 3，建议范围 1-10）
        - 返回多个段落，按从近到远的顺序排列
      - **find_paragraph_by_keyword**: 关键词查找段落（支持 only_with_translation 参数）
      - **get_translation_history**: 获取段落的完整翻译历史（包括所有翻译版本及其AI模型信息）
      - **update_translation**: 更新段落中指定翻译版本的内容（用于编辑和修正翻译历史）
      - **select_translation**: 选择段落中的某个翻译版本作为当前选中的翻译（用于在翻译历史中切换不同的翻译版本）
      - **navigate_to_chapter**: 导航到指定的章节（将用户界面跳转到书籍详情页面并选中指定章节）
        - 当用户需要查看或编辑特定章节时使用此工具
        - 需要提供 chapter_id 参数
      - **navigate_to_paragraph**: 导航到指定的段落（将用户界面跳转到书籍详情页面，选中包含该段落的章节，并滚动到该段落）
        - 当用户需要查看或编辑特定段落时使用此工具
        - 需要提供 paragraph_id 参数
        - 工具会自动找到包含该段落的章节并导航到正确位置

      ### 记忆管理（5个工具）
      - **create_memory**: 创建新的 Memory 记录，用于存储大块内容（如背景设定、章节摘要等）
        - ⚠️ **重要**：调用此工具时，你必须自己生成内容的摘要（summary）并作为参数提供
        - 需要提供 content（实际内容）和 summary（摘要，**必须由 AI 生成**）
        - summary 应该简洁明了，包含关键信息，便于后续通过 search_memory_by_keywords 搜索
        - **使用场景**：
          - 用户提供了背景设定、世界观、角色关系等重要信息时
          - 完成章节翻译后，需要保存章节摘要时
          - 用户询问并讨论了一些重要信息，需要保存供后续参考时
          - 总结书籍的关键设定、剧情要点等
          - ⚠️ **重要**：当你通过工具（如 search_paragraph_by_keyword、get_chapter_info、get_book_info 等）搜索、检索或确认了大量内容（如多个段落、完整章节、书籍信息等）时，应该主动使用 create_memory 保存这些重要信息，以便后续快速参考
        - **示例**：用户说"这本书的背景是魔法世界，主角是魔法师"，你应该使用 create_memory 保存这个信息
      - **get_memory**: 根据 Memory ID 获取指定的 Memory 内容
        - 当需要查看之前存储的背景设定、章节摘要等记忆内容时使用
        - 通常在 search_memory_by_keywords 找到相关 Memory 后，使用此工具获取完整内容
      - **search_memory_by_keywords**: 根据多个关键词搜索 Memory 的摘要（支持多个关键词，返回包含所有关键词的 Memory）
        - ⚠️ **重要**：当查询角色或术语信息时，必须**先**使用 get_character/search_characters_by_keywords 或 get_term/search_terms_by_keywords 查询数据库，**只有在数据库中没有找到时**才可以使用此工具搜索记忆
        - 任何时候，当你需要查找之前保存的内容的时候都应该先查询一下记忆
        - **使用场景**：
          - 用户询问之前讨论过的背景设定、世界观、剧情要点等（**不是角色或术语信息**）
          - 翻译时需要参考之前保存的背景设定
          - 需要查找相关的章节摘要或剧情要点
        - **示例**：用户问"之前提到的背景设定是什么？"，你应该先使用 search_memory_by_keywords 搜索["背景"]，然后使用 get_memory 获取完整内容
        - **错误示例**：用户问"主角的名字是什么？"时，应该先使用 search_characters_by_keywords 或 get_character 查询角色数据库，而不是直接搜索记忆
      - **get_recent_memories**: 获取最近的 Memory 记录列表，按最后访问时间或创建时间排序
        - 当需要快速浏览最近的记忆内容、了解最近的背景设定或章节摘要时使用
        - 适合在对话开始时获取上下文，了解用户最近在讨论什么
        - 可以按创建时间（createdAt）或最后访问时间（lastAccessedAt）排序
        - **使用场景**：
          - 对话开始时需要了解上下文，快速浏览最近的记忆
          - 需要查看最近保存的背景设定或章节摘要
          - 想了解用户最近在讨论哪些话题
          - 当不确定使用哪些关键词搜索时，可以先获取最近的记忆作为参考
        - **参数**：
          - limit: 返回的记忆数量（默认 10，建议 5-20）
          - sort_by: 排序方式，'createdAt' 或 'lastAccessedAt'（默认）
        - **示例**：对话开始时，使用 get_recent_memories 获取最近 10 条记忆，了解用户最近的讨论内容
      - **delete_memory**: 删除指定的 Memory 记录
        - 当确定某个 Memory 不再需要时使用
        - 谨慎使用，通常是当记忆需要更新时使用

      ### 网络搜索（2个工具）
      - **search_web**: 搜索最新信息
        - ⚠️ **禁止**用于修复本地数据（角色/术语格式问题）
        - 仅用于需要外部知识的问题（历史事实、最新技术、实时数据等）
        - 如果非必要，不要使用 search_web 搜索，而是使用 search_*_by_keywords 搜索记忆
        - **必须使用搜索结果**：返回 results 时必须从 title/snippet 提取信息回答，不要忽略
      - **fetch_webpage**: 直接访问指定网页
        - 当用户提供了具体的网页 URL 或需要查看特定网页的详细内容时使用
        - 提取网页的标题和主要内容文本供分析
        - **必须使用返回内容**：仔细阅读返回的 text 内容，从中提取关键信息回答用户问题

      ## 关键原则
      1. **发现问题必须修复**：识别到数据问题（格式错误、翻译错误等）时，必须使用 update_* 工具修复，不要只告知问题
      2. **修复工作流程**：
        - 角色问题：get_character/search_characters_by_keywords → update_character（不要用 search_web）
        - 术语问题：get_term/search_terms_by_keywords → update_term（不要用 search_web）
        - 翻译问题：get_paragraph_info/get_translation_history → update_translation（用于编辑翻译历史中的翻译版本）
      3. **搜索优先**：部分名称/翻译时优先用 search_*_by_keywords，完整名称时用 get_*
      4. **创建前检查**：创建术语/角色前必须检查是否已存在
      5. **查询优先级**：⚠️ **非常重要** - 当用户或 AI 需要查询角色或术语信息时，必须遵循以下优先级顺序：
        - **第一步**：先使用角色/术语数据库工具（get_character、search_characters_by_keywords、get_term、search_terms_by_keywords）查询
        - **第二步**：只有当数据库中没有找到相关信息时，才使用 search_memory_by_keywords 搜索记忆
        - **原因**：角色和术语数据库是权威来源，记忆只是辅助信息。优先查询数据库确保信息准确性和一致性
        - **示例**：用户问"主角的名字和翻译是什么？"，应该先使用 search_characters_by_keywords 查询角色数据库，如果找到就直接返回；如果没有找到，再使用 search_memory_by_keywords 搜索相关记忆
      6. **翻译历史管理**：
        - 使用 get_translation_history 查看段落的完整翻译历史
        - 使用 update_translation 编辑和修正翻译历史中的某个翻译版本
        - 使用 select_translation 选择段落中的某个翻译版本作为当前选中的翻译
        - 翻译历史最多保留5个版本，最新的在最后
      7. **记忆管理最佳实践**：
        - **主动保存重要信息**：当用户提供背景设定、世界观、角色关系等重要信息时，主动使用 create_memory 保存
        - **搜索/检索后保存**：当你通过工具搜索、检索或确认了大量内容（如多个段落、完整章节、书籍信息、角色设定等）时，应该主动使用 create_memory 保存这些信息，避免重复检索
        - **搜索优先于创建**：在创建新记忆前，先使用 search_memory_by_keywords 检查是否已有相关内容，避免重复
        - **获取上下文**：对话开始时或需要了解用户最近的讨论内容时，可以使用 get_recent_memories 快速获取最近的记忆作为上下文
        - **摘要要包含关键词**：生成 summary 时，确保包含用户可能用来搜索的关键词（如角色名、设定名称、章节标题等）
        - **及时更新记忆**：如果发现之前保存的记忆有误或需要更新，先搜索找到相关记忆，然后删除旧记忆并创建新记忆
        - **参考记忆内容**：在回答用户关于背景设定、世界观、剧情要点等问题时，可以搜索相关记忆；但对于角色或术语信息，必须优先查询数据库

`;

    // 添加上下文信息
    if (context.currentBookId || context.currentChapterId || context.selectedParagraphId) {
      prompt += `## 当前工作上下文\n\n`;
      if (context.currentBookId) {
        prompt += `- 书籍 ID: \`${context.currentBookId}\` → 使用 get_book_info 获取详情\n`;
      }
      if (context.currentChapterId) {
        prompt += `- 章节 ID: \`${context.currentChapterId}\` → 使用 get_chapter_info 获取详情\n`;
        prompt += `- 使用 list_chapters 查看所有章节\n`;
      } else if (context.currentBookId) {
        prompt += `- 使用 list_chapters 查看所有章节\n`;
      }
      if (context.selectedParagraphId) {
        prompt += `- 段落 ID: \`${context.selectedParagraphId}\` → 使用 get_paragraph_info 获取详情\n`;
      }
      prompt += `\n询问上下文相关问题时，先使用工具获取信息再回答。\n\n`;
    }

    // 获取当前时间
    const now = new Date();
    const currentTime = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    prompt += `## 使用指南
- 回答用户关于书籍、章节、段落、术语、角色的任何问题
- 提供翻译建议、术语建议、角色名称建议
- 使用简体中文，友好专业地交流
- 目标是帮助用户更高效、准确地完成翻译工作

**当前时间**：${currentTime}

## 记忆工具使用示例

### 场景 1：用户提供背景设定
**用户**："这本书的背景是异世界，有魔法和剑士"
**AI 操作**：
1. 使用 create_memory 保存：
   - content: "这本书的背景是异世界，有魔法和剑士"
   - summary: "异世界背景设定：魔法和剑士"

### 场景 2：用户询问之前保存的信息
**用户**："之前提到的背景设定是什么？"
**AI 操作**：
1. 使用 search_memory_by_keywords 搜索关键词["背景"]
2. 如果找到相关记忆，使用 get_memory 获取完整内容
3. 基于记忆内容回答用户

### 场景 3：完成章节翻译后保存摘要
**用户**："第1章翻译完成了，主要内容是..."
**AI 操作**：
1. 使用 create_memory 保存章节摘要：
   - content: "第1章的完整内容摘要..."
   - summary: "第1章摘要：主要内容概述"

### 场景 4：翻译时参考记忆
**AI 操作流程**：
1. 在翻译前，使用 search_memory_by_keywords 搜索相关的背景设定、角色信息
2. 使用 get_memory 获取完整记忆内容
3. 在翻译时参考这些记忆，确保翻译风格和术语使用的一致性

### 场景 5：搜索/检索大量内容后保存记忆
**用户**："帮我查找所有关于主角的段落"
**AI 操作**：
1. 使用 search_paragraph_by_keyword 搜索"主角"相关的段落
2. 获取到多个段落的内容后，使用 create_memory 保存这些重要信息：
   - content: "关于主角的所有段落内容摘要..."
   - summary: "主角相关段落摘要"
3. 这样下次用户询问主角相关信息时，可以直接从记忆中获取，无需重新搜索

**用户**："告诉我第3章的完整信息"
**AI 操作**：
1. 使用 get_chapter_info 获取第3章的完整信息
2. 获取到章节内容后，使用 create_memory 保存章节摘要：
   - content: "第3章的完整内容和关键信息..."
   - summary: "第3章摘要：章节标题和主要内容"
3. 这样后续可以快速参考，无需重复获取章节信息

### 场景 6：对话开始时获取上下文
**场景**：用户开始新的对话或一段时间后重新对话
**AI 操作**：
1. 使用 get_recent_memories 获取最近 10 条记忆（按最后访问时间排序）
2. 浏览这些记忆，了解用户最近的讨论内容和背景设定
3. 基于这些上下文信息，更好地理解用户的当前问题
4. 如果发现相关的记忆，可以在回答中参考这些信息

### 场景 7：快速浏览最近的记忆
**用户**："我最近都讨论了什么？"
**AI 操作**：
1. 使用 get_recent_memories 获取最近的记忆（例如 limit=15）
2. 可以按创建时间（sort_by='createdAt'）查看最新创建的，或按访问时间查看最近使用的
3. 向用户展示这些记忆的摘要，帮助回顾之前的讨论内容`;

    return prompt;
  }

  /**
   * 估算消息历史的 token 数
   * 使用保守估算：每个字符 2 tokens（对于日文和中文）
   */
  private static estimateTokenCount(messages: ChatMessage[]): number {
    if (!messages || messages.length === 0) return 0;
    const totalContent = messages
      .map((msg) => {
        if (msg.content) {
          return msg.content;
        }
        // 如果有 tool_calls，估算其 token 数
        if ('tool_calls' in msg && msg.tool_calls) {
          return JSON.stringify(msg.tool_calls);
        }
        return '';
      })
      .join('\n');
    // 保守估算：每个字符 2 tokens（对于日文和中文）
    return Math.ceil(totalContent.length * 2);
  }

  /**
   * 检查错误是否是 token 限制相关的错误
   */
  private static isTokenLimitError(error: unknown): boolean {
    if (!error) return false;
    let errorMessage = '';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    } else {
      errorMessage = JSON.stringify(error);
    }
    const lowerMessage = errorMessage.toLowerCase();
    // 检查常见的 token 限制错误关键词
    return (
      lowerMessage.includes('token') &&
      (lowerMessage.includes('limit') ||
        lowerMessage.includes('exceed') ||
        lowerMessage.includes('maximum') ||
        lowerMessage.includes('too long') ||
        lowerMessage.includes('context length'))
    );
  }

  /**
   * 总结会话历史
   * @param model AI 模型
   * @param messages 要总结的消息列表
   * @param options 选项
   */
  static async summarizeSession(
    model: AIModel,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: {
      signal?: AbortSignal;
      onChunk?: TextGenerationStreamCallback;
    } = {},
  ): Promise<string> {
    const { signal, onChunk } = options;

    // 构建总结提示词
    const summaryPrompt = `请总结以下对话历史，提取关键信息和上下文。总结应该简洁明了，包含：
1. 对话的主要话题和讨论内容
2. 用户的主要需求和问题
3. 已解决或讨论的重要事项
4. 需要继续关注的内容

对话历史：
${messages
  .map((msg, idx) => {
    const role = msg.role === 'user' ? '用户' : '助手';
    return `[${idx + 1}] ${role}: ${msg.content}`;
  })
  .join('\n\n')}

请用简洁的中文总结以上对话：`;

    // 获取 AI 服务
    const aiService = AIServiceFactory.getService(model.provider);

    // 构建配置
    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: 0.3, // 使用较低温度以获得更准确的总结
      maxTokens: model.maxTokens,
      signal,
    };

    // 构建请求
    const request: TextGenerationRequest = {
      messages: [
        {
          role: 'system',
          content: '你是一个专业的对话总结助手，擅长提取对话中的关键信息和上下文。',
        },
        {
          role: 'user',
          content: summaryPrompt,
        },
      ],
      temperature: 0.3,
      maxTokens: model.maxTokens,
    };

    // 生成总结
    let fullText = '';
    const result = await aiService.generateText(config, request, async (chunk) => {
      if (chunk.text) {
        fullText += chunk.text;
      }
      if (onChunk) {
        await onChunk(chunk);
      }
    });

    return result.text || fullText;
  }

  /**
   * 处理工具调用
   */
  private static async handleToolCalls(
    toolCalls: AIToolCall[],
    bookId: string | null,
    onAction?: (action: ActionInfo) => void,
    onToast?: ToastCallback,
  ): Promise<Array<{ tool_call_id: string; role: 'tool'; name: string; content: string }>> {
    // 定义需要 bookId 的工具列表
    const toolsRequiringBookId = [
      'create_term',
      'get_term',
      'update_term',
      'delete_term',
      'list_terms',
      'search_terms_by_keywords',
      'get_occurrences_by_keywords',
      'create_character',
      'get_character',
      'update_character',
      'delete_character',
      'search_characters_by_keywords',
      'list_characters',
      'get_book_info',
      'list_chapters',
      'get_chapter_info',
      'get_paragraph_info',
      'get_previous_paragraphs',
      'get_next_paragraphs',
      'find_paragraph_by_keyword',
      'get_memory',
      'search_memory_by_keywords',
      'create_memory',
      'delete_memory',
      'navigate_to_chapter',
      'navigate_to_paragraph',
    ];

    const results = [];
    for (const toolCall of toolCalls) {
      // 检查工具是否需要 bookId
      if (toolsRequiringBookId.includes(toolCall.function.name) && !bookId) {
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          name: toolCall.function.name,
          content: JSON.stringify({
            success: false,
            error: '没有当前书籍上下文，无法执行此工具操作',
          }),
        });
        continue;
      }

      // 调用工具处理函数（对于不需要 bookId 的工具，可以传递空字符串）
      const result = await ToolRegistry.handleToolCall(toolCall, bookId || '', onAction, onToast);
      results.push(result);
    }
    return results;
  }

  /**
   * 与助手对话
   * @param model AI 模型
   * @param userMessage 用户消息
   * @param options 选项
   */
  static async chat(
    model: AIModel,
    userMessage: string,
    options: AssistantServiceOptions = {},
  ): Promise<AssistantResult> {
    const { onChunk, onAction, onToast, signal, aiProcessingStore } = options;

    // 获取 stores
    const contextStore = useContextStore();

    // 获取上下文（只使用 ID）
    const context = contextStore.getContext;

    // 构建系统提示词（只传递 ID）
    let systemPrompt = this.buildSystemPrompt(context);

    // 如果当前会话有总结，添加到系统提示词中
    // 注意：这里需要在调用时传入会话信息，因为 store 不能在静态方法中直接使用
    // 我们通过 options 传递总结信息
    if (options.sessionSummary) {
      systemPrompt += `\n\n## 之前的对话总结\n\n${options.sessionSummary}\n\n**注意**：以上是之前对话的总结。当前对话从总结后的内容继续。`;
    }

    // 获取可用的工具（包括网络搜索工具，即使没有 bookId 也可以使用）
    const tools = ToolRegistry.getAllTools(context.currentBookId || undefined);

    // 创建任务（如果提供了 store）
    let taskId: string | undefined;
    let taskAbortSignal: AbortSignal | undefined;
    if (aiProcessingStore) {
      taskId = await aiProcessingStore.addTask({
        type: 'assistant',
        modelName: model.name || model.id,
        status: 'processing',
        message: '正在处理助手请求...',
      });

      // 获取任务的 abortController signal（用于停止按钮）
      // 注意：这里需要从 store 中获取任务，因为 addTask 返回的是 id
      // 但任务对象（包含 abortController）在 store 的 activeTasks 中
      // 由于 addTask 是异步的，我们需要等待一下或者直接从 store 中查找
      // 实际上，addTask 会立即将任务添加到 activeTasks，所以我们可以直接查找
      const task = aiProcessingStore.activeTasks.find((t) => t.id === taskId);
      if (task?.abortController) {
        taskAbortSignal = task.abortController.signal;
      }
    }

    // 合并 signal：优先使用传入的 signal，如果没有则使用任务的 signal
    const finalSignal = signal || taskAbortSignal;

    try {
      // 构建消息列表
      // 如果提供了历史消息，使用它（但需要确保系统提示词在开头）
      // 如果没有提供，创建新的历史
      const messages: ChatMessage[] = options.messageHistory
        ? [...options.messageHistory]
        : [
            {
              role: 'system',
              content: systemPrompt,
            },
          ];

      // 如果使用了历史消息，需要检查系统提示词是否已存在
      // 如果不存在或已更改，更新系统提示词
      const hasSystemMessage = messages.some((msg) => msg.role === 'system');
      if (hasSystemMessage) {
        // 更新系统提示词（如果已存在）
        const systemIndex = messages.findIndex((msg) => msg.role === 'system');
        if (systemIndex >= 0) {
          messages[systemIndex] = {
            role: 'system',
            content: systemPrompt,
          };
        }
      } else {
        // 如果没有系统消息，在开头添加
        messages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }

      // 添加用户消息
      messages.push({
        role: 'user',
        content: userMessage,
      });

      // 检查 token 限制（在发送请求前）
      // 如果模型有 maxTokens 限制（不是 UNLIMITED_TOKENS），检查是否接近或超过限制
      const estimatedTokens = this.estimateTokenCount(messages);
      const TOKEN_THRESHOLD_RATIO = 0.85; // 当达到 85% 时触发总结
      const shouldSummarizeBeforeRequest =
        model.maxTokens > 0 && estimatedTokens >= model.maxTokens * TOKEN_THRESHOLD_RATIO;

      if (
        shouldSummarizeBeforeRequest &&
        options.messageHistory &&
        options.messageHistory.length > 2
      ) {
        // 需要总结并重置
        // 构建要总结的消息（排除系统消息和当前用户消息）
        const messagesToSummarize = options.messageHistory
          .filter((msg) => msg.role !== 'system')
          .slice(0, -1) // 排除最后一条（当前用户消息）
          .map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content || '',
          }));

        if (messagesToSummarize.length > 0) {
          // 调用总结功能
          const summaryOptions: {
            signal?: AbortSignal;
            onChunk?: TextGenerationStreamCallback;
          } = {};
          if (finalSignal) {
            summaryOptions.signal = finalSignal;
          }
          summaryOptions.onChunk = (chunk) => {
            // 不更新任务状态，静默总结（不显示思考过程）
            if (onChunk) {
              void onChunk(chunk);
            }
          };
          const summary = await this.summarizeSession(model, messagesToSummarize, summaryOptions);

          // 创建记忆（如果有 bookId）
          if (context.currentBookId && summary) {
            try {
              const memorySummary = summary.length > 100 ? summary.slice(0, 100) + '...' : summary;
              await MemoryService.createMemory(
                context.currentBookId,
                summary,
                `会话摘要：${memorySummary}`,
              );
            } catch (error) {
              console.error('Failed to create memory for session summary:', error);
              // 不抛出错误，记忆创建失败不应该影响摘要流程
            }
          }

          // 返回特殊结果，指示需要重置
          return {
            text: '',
            ...(taskId ? { taskId: taskId } : {}),
            actions: [],
            messageHistory: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: userMessage,
              },
            ],
            needsReset: true,
            summary,
          } as AssistantResult & { needsReset: true; summary: string };
        }
      }

      // 获取 AI 服务
      const aiService = AIServiceFactory.getService(model.provider);

      // 构建配置
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model, // 使用实际的模型名称，而不是内部 ID
        temperature: model.temperature ?? 0.7,
        maxTokens: model.maxTokens,
        signal: finalSignal,
      };

      // 构建请求
      const request: TextGenerationRequest = {
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        temperature: model.temperature ?? 0.7,
        maxTokens: model.maxTokens,
      };

      // 流式生成响应
      let fullText = '';
      let toolCalls: AIToolCall[] = [];
      const allActions: ActionInfo[] = [];

      const result = await aiService.generateText(config, request, async (chunk) => {
        // 累积流式文本
        if (chunk.text) {
          fullText += chunk.text;
        }
        if (chunk.toolCalls) {
          toolCalls.push(...chunk.toolCalls);
        }

        // 更新任务状态（保存思考过程）
        if (aiProcessingStore && taskId && chunk.text) {
          await aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
        }

        // 调用用户回调
        if (onChunk) {
          await onChunk(chunk);
        }
      });

      // 使用 result.text 如果存在且不为空，否则使用累积的 fullText
      // 注意：如果 result.text 和累积的 fullText 不一致，需要补充保存缺失的部分
      if (result.text && result.text.trim()) {
        // 如果 result.text 比累积的 fullText 更长，说明有缺失的部分，需要补充保存
        if (result.text.length > fullText.length) {
          const missingText = result.text.slice(fullText.length);
          if (aiProcessingStore && taskId && missingText) {
            await aiProcessingStore.appendThinkingMessage(taskId, missingText);
          }
        }
        fullText = result.text;
      }

      if (result.toolCalls) {
        toolCalls = result.toolCalls;
      }

      // 捕获 reasoning_content（DeepSeek 等模型在使用工具时返回）
      const reasoningContent = result.reasoningContent;

      // 只有在没有工具调用且没有文本时才警告
      if (!fullText.trim() && toolCalls.length === 0) {
        console.warn('[AssistantService] 警告：响应文本和工具调用都为空', {
          resultTextLength: result.text?.length || 0,
          accumulatedLength: fullText.length,
        });
      }

      // 处理工具调用 - 使用循环处理，像 translation-service.ts 一样
      let currentTurnCount = 0;
      const MAX_TURNS = 50; // 最大工具调用轮数
      let finalResponseText = fullText;

      // 将第一次响应添加到历史
      // OpenAI API 要求：如果有 tool_calls，content 可以是 null；如果没有 tool_calls，content 必须有内容
      // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
      if (toolCalls.length > 0) {
        // 有工具调用，content 可以是 null
        messages.push({
          role: 'assistant',
          content: fullText || null,
          tool_calls: toolCalls,
          reasoning_content: reasoningContent || null, // DeepSeek 要求此字段必须存在
        });
      } else if (fullText && fullText.trim()) {
        // 没有工具调用，但 content 有内容
        messages.push({
          role: 'assistant',
          content: fullText,
        });
      }

      // 工具调用循环
      while (toolCalls.length > 0 && currentTurnCount < MAX_TURNS) {
        currentTurnCount++;

        // 执行工具调用
        const toolResults = await this.handleToolCalls(
          toolCalls,
          context.currentBookId,
          (action) => {
            allActions.push(action);
            if (onAction) {
              onAction(action);
            }
          },
          onToast,
        );

        // 将工具结果添加到历史
        messages.push(...toolResults);

        // 检查 AI 的响应中是否提到了要修复/更新/修正等操作
        const needsFixKeywords = [
          '修复',
          '更新',
          '修正',
          '修改',
          '更改',
          '调整',
          '纠正',
          '将其',
          '将其更新',
          '将其修正',
          '将其修复',
        ];
        const mentionedFix = needsFixKeywords.some((keyword) =>
          (finalResponseText || fullText).includes(keyword),
        );

        // 检查工具调用中是否只包含了查询工具，而没有更新工具
        const queryOnlyTools = [
          'get_character',
          'get_term',
          'list_characters',
          'list_terms',
          'search_characters_by_keywords',
          'search_terms_by_keywords',
          'get_book_info',
          'get_chapter_info',
          'get_paragraph_info',
          'get_previous_paragraphs',
          'get_next_paragraphs',
          'find_paragraph_by_keyword',
          'get_occurrences_by_keywords',
        ];
        const hasUpdateTool = toolCalls.some((tc) => !queryOnlyTools.includes(tc.function.name));

        // 检查是否错误地使用了 search_web 来修复本地数据
        const hasWebSearch = toolCalls.some((tc) => tc.function.name === 'search_web');
        const shouldUseLocalTools =
          mentionedFix &&
          (fullText.includes('角色') || fullText.includes('术语') || fullText.includes('格式'));

        // 如果 AI 提到了要修复，但只调用了查询工具，添加提示
        if (mentionedFix && !hasUpdateTool) {
          let reminderContent = '';

          if (hasWebSearch && shouldUseLocalTools) {
            reminderContent =
              '⚠️ 重要错误：你刚才在响应中提到要修复/更新/修正角色或术语信息格式问题，但错误地使用了 search_web 工具来搜索网络。这是不对的！\n\n' +
              '对于修复本地数据（角色信息、术语信息）的格式问题，你应该：\n' +
              '1. 使用 get_character 或 search_characters_by_keywords 工具获取角色信息（如果是角色问题）\n' +
              '2. 使用 get_term 或 search_terms_by_keywords 工具获取术语信息（如果是术语问题）\n' +
              '3. 然后使用 update_character 或 update_term 工具直接修复格式问题\n\n' +
              'search_web 工具只应用于需要外部知识的问题，不应用于修复本地数据格式。请立即使用正确的工具（get_character + update_character 或 get_term + update_term）来完成修复。';
          } else {
            reminderContent =
              '⚠️ 重要：你刚才在响应中提到要修复/更新/修正问题（例如："让我将其更新"、"我来修正"等），但只调用了查询工具来查看信息。现在你必须使用相应的更新工具（如 update_character、update_term 等）来实际执行修复操作，而不是仅仅告诉用户问题所在。请立即调用更新工具来完成修复。';
          }

          if (reminderContent) {
            messages.push({
              role: 'user',
              content: reminderContent,
            });
          }
        }

        // 再次调用 AI 获取回复
        const followUpRequest: TextGenerationRequest = {
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          temperature: model.temperature ?? 0.7,
          maxTokens: model.maxTokens,
        };

        let followUpText = '';
        toolCalls = []; // 重置工具调用列表

        const followUpResult = await aiService.generateText(
          config,
          followUpRequest,
          async (chunk) => {
            if (chunk.text) {
              followUpText += chunk.text;
            }
            if (chunk.toolCalls) {
              toolCalls.push(...chunk.toolCalls);
            }

            // 更新任务状态（保存思考过程）
            if (aiProcessingStore && taskId && chunk.text) {
              await aiProcessingStore.appendThinkingMessage(taskId, chunk.text);
            }

            // 调用用户回调
            if (onChunk) {
              await onChunk(chunk);
            }
          },
        );

        // 使用 result.text 如果存在，否则使用累积的文本
        // 注意：如果 followUpResult.text 和累积的 followUpText 不一致，需要补充保存缺失的部分
        if (followUpResult.text && followUpResult.text.trim()) {
          // 如果 followUpResult.text 比累积的 followUpText 更长，说明有缺失的部分，需要补充保存
          if (followUpResult.text.length > followUpText.length) {
            const missingText = followUpResult.text.slice(followUpText.length);
            if (aiProcessingStore && taskId && missingText) {
              await aiProcessingStore.appendThinkingMessage(taskId, missingText);
            }
          }
          followUpText = followUpResult.text;
        }

        if (followUpResult.toolCalls) {
          toolCalls = followUpResult.toolCalls;
        }

        // 捕获 reasoning_content（DeepSeek 等模型在使用工具时返回）
        const followUpReasoningContent = followUpResult.reasoningContent;

        // 更新最终响应文本（只有在有内容时才更新）
        if (followUpText && followUpText.trim()) {
          finalResponseText = followUpText;
        }

        // 将助手回复添加到历史
        // OpenAI API 要求：如果有 tool_calls，content 可以是 null；如果没有 tool_calls，content 必须有内容
        // DeepSeek 要求：如果有 tool_calls，必须包含 reasoning_content 字段（即使为 null）
        if (toolCalls.length > 0) {
          // 有工具调用，content 可以是 null
          messages.push({
            role: 'assistant',
            content: followUpText || null,
            tool_calls: toolCalls,
            reasoning_content: followUpReasoningContent || null, // DeepSeek 要求此字段必须存在
          });
        } else if (followUpText && followUpText.trim()) {
          // 没有工具调用，但 content 有内容
          messages.push({
            role: 'assistant',
            content: followUpText,
          });
        }

        // 如果没有工具调用，退出循环
        if (toolCalls.length === 0) {
          break;
        }
      }

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        await aiProcessingStore.updateTask(taskId, {
          status: 'completed',
          message: '助手回复完成',
        });
      }

      // 如果没有工具调用，将助手回复添加到历史（如果还没有添加）
      // 确保 content 不为空
      if (toolCalls.length === 0 && finalResponseText && finalResponseText.trim()) {
        // 检查是否已经添加了相同的消息
        const lastAssistantMsg = messages.filter((msg) => msg.role === 'assistant').pop();
        if (!lastAssistantMsg || lastAssistantMsg.content !== finalResponseText) {
          messages.push({
            role: 'assistant',
            content: finalResponseText,
          });
        }
      }

      // 注意：任务状态已在循环退出后更新（第 766-772 行），此处不再重复更新

      // 确保返回的文本不为空
      const finalText = finalResponseText.trim() || '抱歉，我没有收到有效的回复。请重试。';

      if (!finalResponseText.trim()) {
        console.error('[AssistantService] ❌ 错误：最终回复文本为空', {
          currentTurnCount,
        });
      }

      return {
        text: finalText,
        ...(taskId ? { taskId: taskId } : {}),
        actions: allActions,
        messageHistory: messages,
      };
    } catch (error) {
      console.error('[AssistantService] ❌ 发生错误', {
        error: error instanceof Error ? error.message : String(error),
        ...(import.meta.env.DEV && {
          errorStack: error instanceof Error ? error.stack : undefined,
        }),
        model: model.model,
        provider: model.provider,
        taskId,
      });

      // 检查是否是 token 限制错误，如果是，尝试总结并重置
      if (
        this.isTokenLimitError(error) &&
        options.messageHistory &&
        options.messageHistory.length > 2
      ) {
        try {
          // 更新任务状态
          if (aiProcessingStore && taskId) {
            await aiProcessingStore.updateTask(taskId, {
              status: 'processing',
              message: '检测到 token 限制错误，正在总结会话历史...',
            });
          }

          // 构建要总结的消息（排除系统消息）
          const messagesToSummarize = options.messageHistory
            .filter((msg) => msg.role !== 'system')
            .map((msg) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content || '',
            }));

          if (messagesToSummarize.length > 0) {
            // 调用总结功能
            const summaryOptions: {
              signal?: AbortSignal;
              onChunk?: TextGenerationStreamCallback;
            } = {};
            if (finalSignal) {
              summaryOptions.signal = finalSignal;
            }
            summaryOptions.onChunk = (chunk) => {
              // 不更新任务状态，静默总结（不显示思考过程）
              if (onChunk) {
                void onChunk(chunk);
              }
            };
            const summary = await this.summarizeSession(model, messagesToSummarize, summaryOptions);

            // 创建记忆（如果有 bookId）
            if (context.currentBookId && summary) {
              try {
                const memorySummary =
                  summary.length > 100 ? summary.slice(0, 100) + '...' : summary;
                await MemoryService.createMemory(
                  context.currentBookId,
                  summary,
                  `会话摘要：${memorySummary}`,
                );
              } catch (error) {
                console.error('Failed to create memory for session summary:', error);
                // 不抛出错误，记忆创建失败不应该影响摘要流程
              }
            }

            // 更新任务状态
            if (aiProcessingStore && taskId) {
              await aiProcessingStore.updateTask(taskId, {
                status: 'completed',
                message: '会话已总结并重置',
              });
            }

            // 返回特殊结果，指示需要重置
            return {
              text: '',
              ...(taskId ? { taskId: taskId } : {}),
              actions: [],
              messageHistory: [
                {
                  role: 'system',
                  content: systemPrompt,
                },
                {
                  role: 'user',
                  content: userMessage,
                },
              ],
              needsReset: true,
              summary,
            } as AssistantResult & { needsReset: true; summary: string };
          }
        } catch (summaryError) {
          console.error('[AssistantService] ❌ 总结会话失败', summaryError);
          // 如果总结失败，继续抛出原始错误
        }
      }

      // 更新任务状态
      if (aiProcessingStore && taskId) {
        await aiProcessingStore.updateTask(taskId, {
          status: 'error',
          message: error instanceof Error ? error.message : '未知错误',
        });
      }

      throw error;
    }
  }
}
