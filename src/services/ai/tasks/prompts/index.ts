/**
 * 共享提示词模块（优化版）
 * 精简提示词以提高速度、效率和准确性
 */

import type { TaskType } from '../ai-task-helper';

/**
 * 获取全角符号格式规则（精简版）
 */
export function getSymbolFormatRules(): string {
  return `**格式规则**: 使用全角中文标点（，。？！：；""（）——……），保持原文换行/缩进，数字英文保持半角`;
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

**角色管理**: 新角色先检查是否为已有角色别名，描述需包含性别/关系/特征`;
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
  return `**状态**: planning(规划)→working(${taskLabel}中)→completed(验证)→done(完成)`;
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

**状态可独立返回**（无需paragraphs）: \`{"status": "planning"}\`
**包含内容时**: \`{"status": "working", "paragraphs": [{"id": "段落ID", "translation": "${taskLabel}结果"}]${titleNote ? ', "titleTranslation": "标题"' : ''}}\`

${getStatusFieldDescription(taskType)}
- 段落ID必须与原文完全一致，1:1对应${onlyChanged}
- ⚠️ **无需自行检查缺失段落**，系统会自动验证并提示补充
- 所有阶段均可使用工具`;
}

/**
 * 获取执行工作流说明（精简版）
 */
export function getExecutionWorkflowRules(taskType: TaskType): string {
  const workingFocus = {
    translation: '1:1翻译，敬语按流程处理，新术语/角色确认后创建',
    polish: '语气词优化、摆脱翻译腔、节奏调整、角色语言区分',
    proofreading: '文字（错别字/标点/语法）、内容（一致性/逻辑）、格式检查',
  };

  return `【执行流程】
1. **planning**: 获取术语/角色列表（传chapter_id），检查数据问题
2. **working**: ${workingFocus[taskType]}
3. **completed**: 系统验证完整性，可进行后续操作（创建记忆等）
4. **done**: 完成当前块，进入下一块`;
}

/**
 * 获取工具使用说明（精简版）
 */
export function getToolUsageInstructions(taskType: TaskType): string {
  return `【常用工具】
- \`list_terms/list_characters\`: 获取术语/角色（传chapter_id）
- \`search_memory_by_keywords\`: 敬语翻译前先搜索
- \`find_paragraph_by_keywords\`: 检查历史翻译一致性
- \`update_character/update_term\`: 补充翻译、更新描述
- \`create_memory\`: 保存敬语翻译方式等重要信息
- ${getTodoToolsDescription(taskType)}`;
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
