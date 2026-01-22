/**
 * 共享提示词模块（优化版）
 * 精简提示词以提高速度、效率和准确性
 */

// 导出各服务专用的 prompts
export * from './translation';
export * from './proofreading';
export * from './polish';
export * from './chapter-summary';
export * from './term-translation';
export * from './explain';
export * from './assistant';

import type { AITool } from 'src/services/ai/types/ai-service';
import type { TaskType, TaskStatus } from '../utils';

/** 任务类型标签映射（模块级常量，避免重复定义） */
const TASK_LABELS: Record<TaskType, string> = {
  translation: '翻译',
  polish: '润色',
  proofreading: '校对',
  chapter_summary: '章节摘要',
};

function getToolNames(tools?: AITool[]): string[] {
  if (!tools || tools.length === 0) return [];
  return tools.map((t) => t.function.name);
}

/**
 * 工具范围规则：严格限制 AI 只能调用本次请求提供的 tools
 */
export function getToolScopeRules(tools?: AITool[]): string {
  const toolNames = getToolNames(tools);
  const toolList =
    toolNames.length > 0
      ? toolNames.map((n) => `- \`${n}\``).join('\n')
      : '- （本次未提供任何工具）';

  return `【工具范围】⚠️ **只能使用本次会话提供的工具**
- ⛔ 禁止调用未在列表中的工具
- 工具未提供时：基于已有上下文继续任务

【本次可用工具列表】
${toolList}`;
}

/**
 * 获取全角符号格式规则（精简版）
 */
export function getSymbolFormatRules(): string {
  return `**格式规则**: 使用全角中文标点（，。？！：；「」『』（）——……），数字英文保持半角

⚠️ **保持原始格式**:
- 段落换行、缩进、特殊符号（★ ☆ ♥ ○ ● 等）
- 数字格式和英文数字间空格
- ⛔ 禁止添加/删除符号或修改排版`;
}

/**
 * 获取当前状态信息（用于告知AI当前处于哪个阶段）
 * @param taskType 任务类型
 * @param status 当前状态
 * @param isBriefPlanning 是否为简短规划阶段（用于后续 chunk，已继承前一个 chunk 的规划上下文）
 */
export function getCurrentStatusInfo(
  taskType: TaskType,
  status: TaskStatus,
  isBriefPlanning?: boolean,
): string {
  const taskLabel = TASK_LABELS[taskType];

  // 简短规划阶段的描述（用于后续 chunk）
  const briefPlanningDescription = `**当前状态：简短规划阶段 (planning)**
已继承前一部分的规划上下文，术语/角色表已提供。
- 如需补充信息可调用工具，无需重复获取已有信息

**准备好后，将状态设置为 "working" 开始${taskLabel}。**`;

  const statusDescriptions: Record<TaskStatus, string> = {
    planning: isBriefPlanning
      ? briefPlanningDescription
      : `**当前状态：规划阶段 (planning)**
- 如需上下文，使用本次提供的工具获取
- 检查数据问题（空翻译、重复项、误分类）并立即修复
- 可检索记忆了解历史译法

完成规划后，将状态设置为 "working" 并开始${taskLabel}。`,
    working: `**当前状态：${taskLabel}中 (working)**
- 专注于${taskLabel}：${
      taskType === 'translation'
        ? '1:1翻译，敬语按流程处理'
        : taskType === 'chapter_summary'
          ? '生成章节摘要，概括主要情节'
          : taskType === 'polish'
            ? '语气词优化、摆脱翻译腔、节奏调整'
            : '文字（错别字/标点/语法）、内容（一致性/逻辑）、格式检查'
    }
- 发现新信息立即更新
- 输出格式：\`{"s": "working", "p": [{"i": 段落序号, "t": "${taskLabel}结果"}]}\`${
      taskType === 'translation' ? '' : '（只返回有变化的段落）'
    }

完成后设置为 "${taskType === 'translation' ? 'review' : 'end'}"。`,
    review: `**当前状态：复核阶段 (review)**
- 系统已自动验证完整性
- 更新术语/角色描述（如有新发现），可复用信息优先合并到已有记忆
- 检查遗漏或需修正的地方

如需更新已输出的${taskLabel}结果，可将状态改回 "working" 并只返回需更新的段落。
完成后设置为 "end"。`,
    end: `**当前状态：完成 (end)**
当前块已完成，系统将自动提供下一个块。`,
  };

  return statusDescriptions[status];
}

/**
 * 获取数据管理规则（合并敬语/术语/角色工作流）
 * [警告] 核心规则：严禁将敬语添加为别名
 */
export function getDataManagementRules(): string {
  return `【数据管理规则】
⛔ **核心禁止**: 严禁将敬语（如"田中さん"）添加为角色别名

**敬语处理**: 查别名翻译→检查关系→搜索记忆→按关系决定（亲密可省略/正式保留）

**术语/角色分离**:
- 术语表：专有名词、概念、技能、地名、物品（⛔ 禁止放人名）
- 角色表：全名为主名称，姓/名为别名（⛔ 禁止放术语）
- ⚠️ 每个术语只能有一个翻译（如"龙套"而非"路人角色／龙套"）

**角色管理**: 新角色先检查是否为已有别名，描述需简短（性别/关系/关键特征）

⚠️ **保持数据最新**:
- 发现全名 → 更新主名称，原名移入别名
- 发现新信息 → 立即 \`update_term\`/\`update_character\`
- 空翻译/重复/误分类 → 立即修复
- 新术语/角色 → 先检查是否存在，不存在则创建`;
}

/**
 * 获取记忆管理规则（精简版）
 */
export function getMemoryWorkflowRules(): string {
  return `【记忆管理】
目标：**短、有效、可检索、可复用**（写少但写对）

- 使用顺序：\`get_recent_memories\` → \`search_memory_by_keywords\` → \`get_memory\`
- 写入门槛：仅对未来有长期收益、可复用时才写入（⛔ 一次性信息不写入）
- ⚠️ **默认不新建**：优先合并到已有记忆，重写为更短清晰的版本

**字段约束**：summary ≤40字 + 关键词 | content 1-3条要点（总 ≤300字）`;
}

/**
 * 获取待办事项工具描述（精简版）
 */
export function getTodoToolsDescription(taskType: TaskType): string {
  const taskLabel = TASK_LABELS[taskType];
  return `**待办管理**: 复杂任务用 \`create_todo\` 创建详细任务（如"${taskLabel}第1-5段"）`;
}

/**
 * 获取状态字段说明（精简版）
 */
export function getStatusFieldDescription(taskType: TaskType): string {
  const taskLabel = TASK_LABELS[taskType];
  if (taskType === 'translation') {
    return `**状态**: planning→working(${taskLabel}中)→review→end

⚠️ **状态转换规则**:
- 必须按顺序：planning → working → review → end
- 允许：review → working（补充/优化已${taskLabel}段落）
- ⛔ 禁止跳过（working→end / planning→review / planning→end）`;
  }

  // 润色/校对/摘要：跳过并禁用 review
  return `**状态**: planning→working(${taskLabel}中)→end

⚠️ **状态转换规则**:
- 必须按顺序：planning → working → end
- ⛔ 禁止：working→review（禁用review）/ planning→end`;
}

/**
 * 获取输出格式要求（精简版）
 */
export function getOutputFormatRules(taskType: TaskType): string {
  const taskLabel = TASK_LABELS[taskType];
  const onlyChanged = taskType !== 'translation' ? '（只返回有变化的段落）' : '';
  const hasTitle = taskType === 'translation';
  const strictStateNote =
    taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading'
      ? `\n⚠️ **严格状态规则**：只有 \`s="working"\` 时才能输出 \`p/tt\`，其他状态禁止输出内容字段\n`
      : '';

  return `【输出格式】⚠️ 必须只返回JSON（使用简化键名）

**JSON键名**：s=status, p=paragraphs, i=段落序号, t=translation${hasTitle ? ', tt=titleTranslation（标题翻译）' : ''}
**默认 planning**，需上下文时先调用工具
**包含内容**: \`{"s": "working", "p": [{"i": 0, "t": "${taskLabel}结果"}]${hasTitle ? ', "tt": "标题翻译"' : ''}}\`${hasTitle ? '\n（标题翻译只返回一次）' : ''}
${strictStateNote}
${getStatusFieldDescription(taskType)}
- 段落序号(i)与原文1:1对应${onlyChanged}
- ${taskType === 'translation' ? '系统自动验证缺失段落（必须全覆盖）' : '仅需返回修改过的段落'}，所有阶段可用工具`;
}

/**
 * 获取执行工作流说明（精简版）
 * 注意：详细的状态说明已在 getCurrentStatusInfo 中提供，这里只保留高层次流程
 */
export function getExecutionWorkflowRules(taskType: TaskType): string {
  const workingFocus = {
    translation: '1:1翻译，敬语按流程处理，新术语/角色确认后创建',
    polish: '语气词优化、摆脱翻译腔、节奏调整、角色语言区分',
    proofreading: '文字（错别字/标点/语法）、内容（一致性/逻辑）、格式检查',
    chapter_summary: '生成章节摘要：概括主要情节、关键人物和事件，控制在200字以内',
  };

  if (taskType === 'translation') {
    return `【执行流程】
1. **planning**: 获取上下文信息，检查数据问题并修复
2. **working**: ${workingFocus[taskType]}；发现新信息立即更新
3. **review**: 系统复核完整性，更新数据，创建记忆
4. **end**: 完成当前块`;
  }

  return `【执行流程】
1. **planning**: 获取上下文信息，检查数据问题并修复
2. **working**: ${workingFocus[taskType]}；发现新信息立即更新
3. **end**: 完成当前块（润色/校对跳过并禁用 review）`;
}

/**
 * 获取工具使用说明（精简版）
 */
export function getToolUsageInstructions(
  taskType: TaskType,
  tools?: AITool[],
  skipAskUser?: boolean,
): string {
  const taskLabel = TASK_LABELS[taskType];
  const askUserLine = !skipAskUser
    ? '- **询问**: 当有需要用户确认/做决定时，用 `ask_user_batch` 一次性解决所有疑问\n'
    : '';
  return `${getToolScopeRules(tools)}

【工具使用建议】
- 用途：获取上下文、维护术语/角色/记忆、查询历史翻译
- 优先用本地数据，网络工具仅用于外部知识
${askUserLine}- 最小必要：拿到信息后立刻回到${taskLabel}输出
- ${getTodoToolsDescription(taskType)}`;
}
