/**
 * 共享提示词模块（优化版）
 * 精简提示词以提高速度、效率和准确性
 */

import type { AITool } from 'src/services/ai/types/ai-service';
import type { TaskType, TaskStatus } from '../utils/ai-task-helper';

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
      : '- （本次未提供任何工具，请不要尝试调用工具）';

  return `【工具范围】[警告] **只能使用本次会话提供的工具**
- 你**只能**调用系统在本次请求中提供的 tools（见下方列表）
- [禁止] 禁止调用任何未在列表中出现的工具（即使你知道它存在、或在其它提示里见过）
- 如果你需要的工具未提供：请直接继续任务（基于已有上下文）或向用户说明限制

【本次可用工具列表】
${toolList}`;
}

/**
 * 获取全角符号格式规则（精简版）
 */
export function getSymbolFormatRules(): string {
  return `**格式规则**: 使用全角中文标点（，。？！：；「」『』（）——……），保持原文换行/缩进，数字英文保持半角`;
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
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];

  // 简短规划阶段的描述（用于后续 chunk）
  const briefPlanningDescription = `**当前状态：简短规划阶段 (planning)**
你当前处于简短规划阶段（后续块），已继承前一部分的规划上下文。
- 术语表和角色表信息已在上下文中提供
- 如需补充或验证信息，可以调用工具
- 通常无需重复获取已有的术语/角色信息

**准备好后，将状态设置为 "working" 开始${taskLabel}。**`;

  const statusDescriptions: Record<TaskStatus, string> = {
    planning: isBriefPlanning
      ? briefPlanningDescription
      : `**当前状态：规划阶段 (planning)**
你当前处于规划阶段，应该：
- 如需术语/角色/记忆等上下文，优先使用**本次会话提供的工具**获取（仅可使用可用工具列表中的工具）
- 检查数据问题（如空翻译、重复项、误分类等），发现问题立即修复
- 如有可用的记忆搜索工具，可检索相关记忆了解上下文与历史译法
- 准备开始${taskLabel}工作

完成规划后，将状态设置为 "working" 并开始${taskLabel}。`,
    working: `**当前状态：${taskLabel}中 (working)**
你当前处于${taskLabel}阶段，应该：
- 专注于${taskLabel}工作：${taskType === 'translation' ? '1:1翻译，敬语按流程处理' : taskType === 'polish' ? '语气词优化、摆脱翻译腔、节奏调整' : '文字（错别字/标点/语法）、内容（一致性/逻辑）、格式检查'}
- 发现新信息（新术语/角色、关系变化等）立即更新
- 输出${taskLabel}结果，格式：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]}\`

完成所有段落的${taskLabel}后，将状态设置为 "completed"。`,
    completed: `**当前状态：验证阶段 (completed)**
你当前处于验证阶段，应该：
- 系统已自动验证完整性
- 更新术语/角色描述（如有新发现）
- 如有**对未来翻译任务有长期收益、可复用**的重要信息（如稳定的敬语处理规则、固定译法选择等），再创建记忆；一次性信息不要写入记忆
- 检查是否有遗漏或需要修正的地方

如果你发现**任何已输出的${taskLabel}结果仍需要更新**（例如：措辞、敬语/称谓处理、术语一致性、语气节奏、错别字/标点/语法等），可以将状态从 "completed" 改回 "working" 继续工作，并**只返回需要更新的段落**即可。
如果所有工作已完成，将状态设置为 "end"。`,
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
[警告] **核心禁止**: 严禁将敬语（如"田中さん"）添加为角色别名

**敬语处理流程**:
1. 查找角色别名翻译 → 2. 检查角色描述中的关系 → 3. 搜索记忆/历史翻译 → 4. 按关系决定翻译方式
- 亲密关系→可省略敬语 | 正式关系→保留敬语 | 不明确→按上下文判断
- 如形成**可复用且稳定**的敬语翻译约定（需确认说话者和关系），可创建记忆保存；不确定/一次性信息不要写入记忆

**术语/角色分离**:
- 术语表：专有名词、概念、技能、地名、物品（[禁止]禁止放人名）
- 角色表：人物全名为主名称，姓/名单独部分为别名（[禁止]禁止放术语）
- 发现空翻译→立即更新 | 发现重复→删除并合并 | 发现误分类→删除后重建
- [警告] **术语翻译规则**：每个术语只能有一个翻译，不要使用多个翻译（如"路人角色／龙套"），应选择一个最合适的翻译（如"龙套"）

**角色管理**: 新角色先检查是否为已有角色别名，描述需简短且只包含重要信息（如性别/关系/关键特征）

[警告] **保持数据最新**（必须执行）:
- 翻译过程中发现术语/角色**新信息**（如：新别名、关系变化、能力揭示、性格细节）→ **立即更新** \`update_term\`/\`update_character\`
- 发现描述**过时或不完整** → **立即补充**最新重要信息到description/speaking_style（[警告] 描述应简短，只包含重要信息）
- 发现翻译**不一致或有误**或**包含多个选项**（如"路人角色／龙套"）→ **立即修正**为单一翻译
- 新出现的术语/角色 → 先检查是否已存在，不存在则**立即创建**`;
}

/**
 * 获取记忆管理规则（精简版）
 */
export function getMemoryWorkflowRules(): string {
  return `【记忆管理】
- 翻译相关任务（翻译/润色/校对）前，如本次提供了记忆搜索工具，可优先搜索相关记忆（优先复用既有约定）
- **只在“对未来翻译任务有长期收益、可跨段落/跨章节复用”时才创建记忆**（否则不要创建）
  - ✅ 适合写入（翻译相关）：稳定的敬语/称谓处理规则（明确“谁对谁/关系→中文处理方式”）、固定译法选择与禁忌（同一术语/人名/梗固定一种译法）、长期风格约定（叙述口吻/口癖/标点习惯）、常见翻译纠错规则（例如某词误译纠正）
  - ❌ 禁止写入：一次性句子翻译、仅本段有效的临时推断/未确认剧情细节、可从原文直接得出的信息、纯进度/任务状态、重复已有术语/角色数据（这些应通过 term/character 工具维护）
- [警告] **一句话**：一次性信息不要写入记忆
- 如本次提供了创建/更新记忆工具：创建记忆时让 summary **包含可检索关键词**（角色名/称谓/术语/规则关键词）；需修正时优先更新而非重复创建`;
}

/**
 * 获取待办事项工具描述（精简版）
 */
export function getTodoToolsDescription(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  return `**待办管理**: 仅复杂任务需要创建待办列表，简单任务可直接处理。如需创建，使用 \`create_todo\` 创建详细可执行任务（如"${taskLabel}第1-5段"而非"${taskLabel}文本"），支持批量创建`;
}

/**
 * 获取状态字段说明（精简版）
 */
export function getStatusFieldDescription(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  return `**状态**: planning(规划)→working(${taskLabel}中)→completed(验证)→end(完成)

[警告] **状态转换规则**（必须严格遵守）:
- **禁止跳过状态**：必须按照 planning → working → completed → end 的顺序进行
- **允许的转换**：
  - planning → working
  - working → completed
  - completed → end
  - completed → working（如果需要补充缺失段落、编辑/优化已${taskLabel}的段落）
- **禁止的转换**：
  - [禁止] working → end（必须经过 completed）
  - [禁止] planning → completed（必须经过 working）
  - [禁止] planning → end（必须经过 working 和 completed）`;
}

/**
 * 获取输出格式要求（精简版）
 */
export function getOutputFormatRules(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  const onlyChanged = taskType !== 'translation' ? '（只返回有变化的段落）' : '';
  const titleNote = taskType === 'translation' ? '，有标题时加 titleTranslation' : '';

  return `【输出格式】[警告] 必须只返回JSON
[禁止] 禁止使用翻译管理工具

**开始任务时**：先将状态设置为 "planning" 开始规划（返回 \`{"status": "planning"}\`）
**状态可独立返回**（无需paragraphs）: \`{"status": "planning"}\`
**包含内容时**: \`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]${titleNote ? ', "titleTranslation": "标题"' : ''}}\`
**标题翻译只要返回一次就好，不要重复返回**

${getStatusFieldDescription(taskType)}
- 段落ID必须与原文完全一致，1:1对应${onlyChanged}
- [警告] **无需自行检查缺失段落**，系统会自动验证并提示补充
- 所有阶段均可使用工具`;
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
  };

  return `【执行流程】
1. **planning**: 获取上下文信息，检查数据问题并修复
2. **working**: ${workingFocus[taskType]}；发现新信息立即更新
3. **completed**: 系统验证完整性，更新数据，创建记忆
4. **end**: 完成当前块`;
}

/**
 * 获取工具使用说明（精简版）
 */
export function getToolUsageInstructions(taskType: TaskType, tools?: AITool[]): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  return `${getToolScopeRules(tools)}

【工具使用建议】（仅限可用工具列表中的工具）
- **用途**：工具仅用于获取上下文、维护术语/角色/记忆（如本次提供），以及查询历史翻译一致性
- **优先级**：能用本地数据工具解决就不要依赖外部信息；如本次提供了网络工具，仅用于外部知识检索
- **最小必要**：只在确有需要时调用工具，拿到信息后立刻回到${taskLabel}输出
- ${getTodoToolsDescription(taskType)}`;
}

/**
 * 获取分块处理说明
 * 告知AI系统将分块提供章节内容，只需关注当前块
 */
export function getChunkingInstructions(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  return `【分块处理说明】
[警告] **重要**：系统会将当前章节分成多个块（chunks）依次提供给你
- **只需关注当前块**：你只需要处理系统当前提供的文本块，不要考虑其他块的内容
- **完成当前块后**：当前块完成后（状态设为 "end"），系统会自动提供下一个块
- **不要提前处理**：不要尝试获取或处理尚未提供的块，专注于完成当前块的所有段落${taskLabel}`;
}

// ============================================================================
// 保留旧函数名以保持向后兼容性（内部调用新的合并函数）
// ============================================================================

/**
 * @deprecated 使用 getDataManagementRules() 替代
 */
export function getHonorificWorkflowRules(): string {
  return getDataManagementRules();
}

/**
 * @deprecated 使用 getDataManagementRules() 替代
 */
export function getTerminologyWorkflowRules(): string {
  return ''; // 已合并到 getDataManagementRules
}

/**
 * @deprecated 使用 getDataManagementRules() 替代
 */
export function getCharacterWorkflowRules(): string {
  return ''; // 已合并到 getDataManagementRules
}
