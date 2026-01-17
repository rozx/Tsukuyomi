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
  return `**格式规则**: 使用全角中文标点（，。？！：；「」『』（）——……），保持原文换行/缩进，数字英文保持半角

[警告] **保持原始格式**: 必须保持原文的所有格式和符号，包括：
- 段落换行和缩进
- 特殊符号、表情符号、装饰符号（如 ★ ☆ ♥ ○ ● 等）
- 数字格式（半角/全角）
- 英文和数字之间的空格
- [禁止] 不要添加或删除任何非必要的符号
- [禁止] 不要修改原文的排版结构`;
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
- 无需重复获取已有的术语/角色信息，使用随文章提供的角色/术语表，除非未提供，否则不必调用工具获取

**准备好后，将状态设置为 "working" 开始${taskLabel}。**`;

  const statusDescriptions: Record<TaskStatus, string> = {
    planning: isBriefPlanning
      ? briefPlanningDescription
      : `**当前状态：规划阶段 (planning)**
你当前处于规划阶段，应该：
- 如需术语/角色/记忆等上下文，优先使用**本次会话提供的工具**获取（仅可使用可用工具列表中的工具）
- 检查数据问题（如空翻译、重复项、误分类等），发现问题立即修复
- 如有可用的记忆搜索工具，可检索相关记忆了解上下文与历史译法
- 无需重复获取已有的术语/角色信息
- 准备开始${taskLabel}工作

完成规划后，将状态设置为 "working" 并开始${taskLabel}。`,
    working: `**当前状态：${taskLabel}中 (working)**
你当前处于${taskLabel}阶段，应该：
- 专注于${taskLabel}工作：${taskType === 'translation' ? '1:1翻译，敬语按流程处理' : taskType === 'polish' ? '语气词优化、摆脱翻译腔、节奏调整' : '文字（错别字/标点/语法）、内容（一致性/逻辑）、格式检查'}
- 发现新信息（新术语/角色、关系变化等）立即更新
- 输出${taskLabel}结果，格式：\`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]}\`${taskType === 'translation' ? '' : '（只返回有变化的段落；若无变化可不返回 paragraphs）'}

完成所有段落的${taskLabel}后，将状态设置为 "${taskType === 'translation' ? 'review' : 'end'}"。`,
    review: `**当前状态：复核阶段 (review)**
你当前处于复核阶段，应该：
- 系统已自动验证完整性
- 更新术语/角色描述（如有新发现）
  - 如有**对未来翻译任务有长期收益、可复用**的重要信息（如稳定的敬语处理规则、固定译法选择等），优先**合并并更新**已有记忆（避免重复）；仅当不存在任何可更新的相关记忆时才创建新记忆；一次性信息不要写入记忆
- 检查是否有遗漏或需要修正的地方

如果你发现**任何已输出的${taskLabel}结果仍需要更新**（例如：措辞、敬语/称谓处理、术语一致性、语气节奏、错别字/标点/语法等），可以将状态从 "review" 改回 "working" 继续工作，并**只返回需要更新的段落**即可。
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
- 如形成**可复用且稳定**的敬语翻译约定（需确认说话者和关系），优先更新/合并已有记忆（避免重复），必要时再创建；不确定/一次性信息不要写入记忆

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
- 目标：记忆必须**短、有效、可检索、可复用**（写少但写对）

- 使用顺序（如工具可用）：先 \`get_recent_memories\` 快速了解近期记忆；再用 \`search_memory_by_keywords\` 定向检索相关记忆（必要时再 \`get_memory\`）

- 写入门槛：**只在“对未来翻译任务有长期收益、可跨段落/跨章节复用”时才写入/更新记忆**
- [警告] 一次性信息不要写入记忆

- [强制] **默认不要新建**：发现新信息时，优先选择最相关的已有记忆进行**合并 + 更新**
  - 更新方式：把新旧信息**重写成更短更清晰的合并版本**（不要把新内容“追加”到末尾）
  - 仅当不存在任何可更新的相关记忆时，才创建新的记忆

- 字段硬约束（必须遵守）：
  - summary：1 句（≤40 字）+ 关键词（人名/称谓/术语/规则）
  - content：1–3 条要点（总 ≤300 字），每条只写 1 个可复用规则/约定`;
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
  if (taskType === 'translation') {
    return `**状态**: planning(规划)→working(${taskLabel}中)→review(复核)→end(完成)

[警告] **状态转换规则**（必须严格遵守）:
- **禁止跳过状态**：必须按照 planning → working → review → end 的顺序进行
- **允许的转换**：
  - planning → working
  - working → review
  - review → end
  - review → working（如果需要补充缺失段落、编辑/优化已${taskLabel}的段落）
- **禁止的转换**：
  - [禁止] working → end（必须经过 review）
  - [禁止] planning → review（必须经过 working）
  - [禁止] planning → end（必须经过 working 和 review）`;
  }

  // 润色/校对：跳过并禁用 review
  return `**状态**: planning(规划)→working(${taskLabel}中)→end(完成)

[警告] **状态转换规则**（必须严格遵守）:
- **禁止跳过状态**：必须按照 planning → working → end 的顺序进行
- **允许的转换**：
  - planning → working
  - working → end
- **禁止的转换**：
  - [禁止] working → review（润色/校对任务禁用 review）
  - [禁止] planning → review（必须经过 working）
  - [禁止] planning → end（必须经过 working）`;
}

/**
 * 获取输出格式要求（精简版）
 */
export function getOutputFormatRules(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  const onlyChanged = taskType !== 'translation' ? '（只返回有变化的段落）' : '';
  const titleNote = taskType === 'translation' ? '，有标题时加 titleTranslation' : '';
  const strictStateNote =
    taskType === 'translation' || taskType === 'polish' || taskType === 'proofreading'
      ? `\n[警告] **严格状态规则**：\n- 只有当 \`status="working"\` 时才允许输出 \`paragraphs/titleTranslation\`\n- 当 \`status="planning"\`、\`status="review"\` 或 \`status="end"\` 时 **禁止** 输出任何内容字段，否则系统会视为错误状态并要求你立刻重试\n`
      : '';

  return `【输出格式】[警告] 必须只返回JSON
[禁止] 禁止使用翻译管理工具

**默认状态**：系统默认处于 planning，**无需再单独返回 planning**；需要上下文时可先调用工具。
**状态可独立返回**（无需paragraphs）: \`{"status": "planning"}\`（仅当你需要先规划/调用工具且暂不输出内容时）
**包含内容时**: \`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]${titleNote ? ', "titleTranslation": "标题"' : ''}}\`
**标题翻译只要返回一次就好，不要重复返回**
${strictStateNote}

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
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  const askLine = !skipAskUser
    ? '- **询问**: 如遇到需要用户确认的问题，可以使用相关工具向用户提问，询问应该一次性解决所有疑问，保证用户体验'
    : '';
  return `${getToolScopeRules(tools)}

【工具使用建议】（仅限可用工具列表中的工具）
- **用途**：工具仅用于获取上下文、维护术语/角色/记忆（如本次提供），以及查询历史翻译一致性
- **优先级**：能用本地数据工具解决就不要依赖外部信息；如本次提供了网络工具，仅用于外部知识检索
${askLine ? askLine + '\n' : ''}- **最小必要**：只在确有需要时调用工具，拿到信息后立刻回到${taskLabel}输出
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
