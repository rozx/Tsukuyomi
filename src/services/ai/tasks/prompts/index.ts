/**
 * 共享提示词模块（优化版）
 * 精简提示词以提高速度、效率和准确性
 */

import type { TaskType, TaskStatus } from '../utils/ai-task-helper';

/**
 * 获取全角符号格式规则（精简版）
 */
export function getSymbolFormatRules(): string {
  return `**格式规则**: 使用全角中文标点（，。？！：；""（）——……），保持原文换行/缩进，数字英文保持半角`;
}

/**
 * 获取当前状态信息（用于告知AI当前处于哪个阶段）
 * @param taskType 任务类型
 * @param status 当前状态
 * @param isBriefPlanning 是否为简短规划阶段（用于后续 chunk，已继承前一个 chunk 的规划上下文）
 */
export function getCurrentStatusInfo(taskType: TaskType, status: TaskStatus, isBriefPlanning?: boolean): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];

  // 简短规划阶段的描述（用于后续 chunk）
  const briefPlanningDescription = `**当前状态：简短规划阶段 (planning)**
你当前处于简短规划阶段（后续块），已继承前一部分的规划上下文。
- ✅ 术语表和角色表信息已在上下文中提供
- 如需补充或验证信息，可以调用工具
- 通常无需重复获取已有的术语/角色信息

**准备好后，将状态设置为 "working" 开始${taskLabel}。**`;

  const statusDescriptions: Record<TaskStatus, string> = {
    planning: isBriefPlanning ? briefPlanningDescription : `**当前状态：规划阶段 (planning)**
你当前处于规划阶段，应该：
- 获取术语表和角色表（使用 \`list_terms\` 和 \`list_characters\`，传入 chapter_id）
- 检查数据问题（如空翻译、重复项、误分类等），发现问题立即修复
- 搜索相关记忆（使用 \`search_memory_by_keywords\`）了解上下文
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
- 创建记忆保存重要信息（如敬语翻译方式、角色关系等）
- 检查是否有遗漏或需要修正的地方

如果需要补充缺失段落或编辑/优化已${taskLabel}的段落，可以将状态设置为 "working" 继续工作。
如果所有工作已完成，将状态设置为 "end"。`,
    end: `**当前状态：完成 (end)**
当前块已完成，系统将自动提供下一个块。`,
  };

  return statusDescriptions[status];
}

/**
 * 获取数据管理规则（合并敬语/术语/角色工作流）
 * ⚠️ 核心规则：严禁将敬语添加为别名
 */
export function getDataManagementRules(): string {
  return `【数据管理规则】
⚠️ **核心禁止**: 严禁将敬语（如"田中さん"）添加为角色别名

**敬语处理流程**:
1. 查找角色别名翻译 → 2. 检查角色描述中的关系 → 3. 搜索记忆/历史翻译 → 4. 按关系决定翻译方式
- 亲密关系→可省略敬语 | 正式关系→保留敬语 | 不明确→按上下文判断
- 翻译后创建记忆保存敬语翻译方式（需确认说话者和关系）

**术语/角色分离**:
- 术语表：专有名词、概念、技能、地名、物品（❌禁止放人名）
- 角色表：人物全名为主名称，姓/名单独部分为别名（❌禁止放术语）
- 发现空翻译→立即更新 | 发现重复→删除并合并 | 发现误分类→删除后重建

**角色管理**: 新角色先检查是否为已有角色别名，描述需简短且只包含重要信息（如性别/关系/关键特征）

⚠️ **保持数据最新**（必须执行）:
- 翻译过程中发现术语/角色**新信息**（如：新别名、关系变化、能力揭示、性格细节）→ **立即更新** \`update_term\`/\`update_character\`
- 发现描述**过时或不完整** → **立即补充**最新重要信息到description/speaking_style（⚠️ 描述应简短，只包含重要信息）
- 发现翻译**不一致或有误** → **立即修正**翻译
- 新出现的术语/角色 → 先检查是否已存在，不存在则**立即创建**`;
}

/**
 * 获取记忆管理规则（精简版）
 */
export function getMemoryWorkflowRules(): string {
  return `【记忆管理】
- 翻译敬语前先 \`search_memory_by_keywords\` 搜索相关记忆
- 完成翻译后用 \`create_memory\` 保存重要信息（敬语翻译方式、角色关系等）
- 发现记忆需更新时用 \`update_memory\` 更新`;
}

/**
 * 获取待办事项工具描述（精简版）
 */
export function getTodoToolsDescription(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  return `**待办管理**: \`create_todo\`创建详细可执行任务（如"${taskLabel}第1-5段"而非"${taskLabel}文本"），支持批量创建`;
}

/**
 * 获取状态字段说明（精简版）
 */
export function getStatusFieldDescription(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  return `**状态**: planning(规划)→working(${taskLabel}中)→completed(验证)→end(完成)

⚠️ **状态转换规则**（必须严格遵守）:
- **禁止跳过状态**：必须按照 planning → working → completed → end 的顺序进行
- **允许的转换**：
  - planning → working
  - working → completed
  - completed → end
  - completed → working（如果需要补充缺失段落、编辑/优化已${taskLabel}的段落）
- **禁止的转换**：
  - ❌ working → end（必须经过 completed）
  - ❌ planning → completed（必须经过 working）
  - ❌ planning → end（必须经过 working 和 completed）`;
}

/**
 * 获取输出格式要求（精简版）
 */
export function getOutputFormatRules(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  const onlyChanged = taskType !== 'translation' ? '（只返回有变化的段落）' : '';
  const titleNote = taskType === 'translation' ? '，有标题时加 titleTranslation' : '';

  return `【输出格式】⚠️ 必须只返回JSON
❌ 禁止使用翻译管理工具

**开始任务时**：先将状态设置为 "planning" 开始规划（返回 \`{"status": "planning"}\`）
**状态可独立返回**（无需paragraphs）: \`{"status": "planning"}\`
**包含内容时**: \`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]${titleNote ? ', "titleTranslation": "标题"' : ''}}\`
**标题翻译只要返回一次就好，不要重复返回**

${getStatusFieldDescription(taskType)}
- 段落ID必须与原文完全一致，1:1对应${onlyChanged}
- ⚠️ **无需自行检查缺失段落**，系统会自动验证并提示补充
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
export function getToolUsageInstructions(taskType: TaskType): string {
  return `【常用工具】
- \`list_terms/list_characters\`: 获取术语/角色（传chapter_id）
- \`search_memory_by_keywords\`: 敬语翻译前先搜索
- \`find_paragraph_by_keywords\`: 检查历史翻译一致性
- ⭐ \`update_character/update_term\`: **发现新信息立即更新**（补充翻译、更新描述、添加别名、修正错误）
- \`create_term/create_character\`: 新术语/角色立即创建
- \`create_memory\`: 保存敬语翻译方式等重要信息
- ${getTodoToolsDescription(taskType)}
⚠️ \`get_previous_paragraphs/get_next_paragraphs\` 仅用于获取上下文参考，不要用于获取更多段落来处理`;
}

/**
 * 获取分块处理说明
 * 告知AI系统将分块提供章节内容，只需关注当前块
 */
export function getChunkingInstructions(taskType: TaskType): string {
  const taskLabels = { translation: '翻译', polish: '润色', proofreading: '校对' };
  const taskLabel = taskLabels[taskType];
  return `【分块处理说明】
⚠️ **重要**：系统会将当前章节分成多个块（chunks）依次提供给你
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
