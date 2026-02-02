import type { AITool } from 'src/services/ai/types/ai-service';
import type { TaskType, TaskStatus } from '../utils';
import { getTaskStateWorkflowText, TASK_TYPE_LABELS } from '../utils';

/**
 * 工具范围规则：严格限制 AI 只能调用本次请求提供的 tools
 */
export function getToolScopeRules(tools?: AITool[]): string {
  const toolNames = tools?.map((t) => t.function.name) ?? [];
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
 * 获取规划阶段描述
 */
function getPlanningStateDescription(taskLabel: string, isBriefPlanning?: boolean): string {
  // 简短规划阶段的描述（用于后续 chunk）
  if (isBriefPlanning) {
    return `**当前状态：简短规划阶段 (planning)**
已继承前一部分的规划上下文，术语/角色表已提供。
- 如需补充信息可调用工具，无需重复获取已有信息

**准备好后，将状态设置为 "working" 开始${taskLabel}。**`;
  }

  return `**当前状态：规划阶段 (planning)**
- 如需上下文，使用本次提供的工具获取
- 检查数据问题（空翻译、重复项、误分类）并立即修复
- 可检索记忆了解历史译法

完成规划后，将状态设置为 "working" 并开始${taskLabel}。`;
}

function getWorkingStateDescription(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  let focusDesc = '';
  switch (taskType) {
    case 'translation':
      focusDesc = '1:1翻译，敬语按流程处理';
      break;
    case 'chapter_summary':
      focusDesc = '生成章节摘要，概括主要情节';
      break;
    case 'polish':
      focusDesc = '语气词优化、摆脱翻译腔、节奏调整';
      break;
    default:
      focusDesc = '文字（错别字/标点/语法）、内容（一致性/逻辑）、格式检查';
  }

  const onlyChangedNote = taskType === 'translation' ? '' : '（只返回有变化的段落）';

  return `**当前状态：${taskLabel}中 (working)**
- 专注于${taskLabel}：${focusDesc}
- 发现新信息立即更新
- 输出格式：**单独**以JSON格式输出内容 ${onlyChangedNote}
- ⚠️ 严禁将 status 与 paragraphs 放在同一个 JSON 对象中

完成后设置为 "${taskType === 'translation' ? 'review' : 'end'}"。`;
}

/**
 * 获取复核阶段描述
 */
function getReviewStateDescription(taskLabel: string): string {
  return `**当前状态：复核阶段 (review)**
- 系统已自动验证完整性
- 添加/更新术语
- 添加/更新角色描述、说话口吻、别名（如有新发现）, 如检测到角色全名，使用角色全名，将姓/名添加到别名中。
- 如看到对日后翻译有帮助的信息，可复用信息优先合并到已有记忆
- 检查遗漏或需修正的地方，特别是人称代词和语气词。

如需更新已输出的${taskLabel}结果，可将状态改回 "working" 并只返回需更新的段落。
完成后设置为 "end"。`;
}

/**
 * 获取结束阶段描述
 */
function getEndStateDescription(): string {
  return `**当前状态：完成 (end)**
当前块已完成，系统将自动提供下一个块。`;
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
  const taskLabel = TASK_TYPE_LABELS[taskType];

  switch (status) {
    case 'planning':
      return getPlanningStateDescription(taskLabel, isBriefPlanning);
    case 'working':
      return getWorkingStateDescription(taskType);
    case 'review':
      return getReviewStateDescription(taskLabel);
    case 'end':
      return getEndStateDescription();
    default:
      return '';
  }
}

/**
 * 获取数据管理规则（合并敬语/术语/角色工作流）
 * [警告] 核心规则：严禁将敬语添加为别名
 */
export function getDataManagementRules(): string {
  return `【数据管理规则】
⛔ **核心禁止**: 严禁将敬语（如"田中さん"）添加为角色别名

**敬语处理**: 查别名翻译→检查关系→搜索记忆→检查之前的翻译→按关系决定（亲密可省略/正式保留）

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
- **附件最佳实践**：与具体实体相关的记忆必须设置 \`attached_to\`（角色/术语/章节）；通用背景/世界观用 \`book\`。可同时附加多个实体。
- **补齐附件**：发现记忆缺少或错误附件时，用 \`update_memory\` 纠正（替换 \`attached_to\`）。

**附件示例**：
- 角色背景 → \`attached_to=[{type:"character", id:"..."}]\`
- 术语定义 → \`attached_to=[{type:"term", id:"..."}]\`
- 章节摘要 → \`attached_to=[{type:"chapter", id:"..."}]\`
- 全书设定 → \`attached_to=[{type:"book", id:"..."}]\`

**字段约束**：summary ≤40字 + 关键词 | content 1-3条要点（总 ≤300字）`;
}

/**
 * 获取待办事项工具描述（精简版）
 */
export function getTodoToolsDescription(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  return `**待办管理**:
  - 复杂任务用 \`create_todo\` 创建详细任务（如"${taskLabel}第1-5段"）
  - 简单任务直接处理，无需创建待办
  - 任务完成时用 \`mark_todo_done\` 标记完成， 无需删除
  `;
}

/**
 * 获取状态字段说明（精简版）
 */
export function getStatusFieldDescription(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const rules = `⚠️ **状态转换规则**:
- ${getTaskStateWorkflowText(taskType)}`;
  const reviewState = taskType === 'translation' ? '→review' : '';

  return `**状态**: planning→working(${taskLabel}中)${reviewState}→end

${rules}
`;
}

export function getOutputFormatRules(taskType: TaskType): string {
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const onlyChanged = taskType !== 'translation' ? '（只返回有变化的段落）' : '';
  const hasTitle = taskType === 'translation';

  // 这里的示例只包含内容，不含 status
  const jsonContent = `{"p": [{"i": 0, "t": "${taskLabel}结果"}]${hasTitle ? ', "tt": "标题翻译"' : ''}}`;
  const individualContent = `{"i": 0, "t": "${taskLabel}结果"}`;
  const titleNote = hasTitle ? '\n（标题翻译只返回一次）' : '';

  // 对于非翻译任务（polish/proofreading），支持返回单个段落对象
  const individualNote =
    taskType !== 'translation'
      ? '\n- 支持两种格式：数组格式 `{"p": [...]}` 或单个段落 `{"i": 0, "t": "..."}`'
      : '';

  return `【输出格式】⚠️ 必须只返回 JSON（使用简化键名）

**JSON键名**：s=status, p=paragraphs, i=段落序号, t=translation${hasTitle ? ', tt=titleTranslation（标题翻译）' : ''}
**默认 planning**，需上下文时先调用工具

⚠️ **状态切换独立性（核心）**:
- 状态变更（s字段）必须单独输出一个JSON对象：\`{"s": "working"}\`
- 翻译内容必须单独输出一个JSON对象：\`${jsonContent}\`${individualNote}${titleNote}
- **严禁**将 s 与 p/tt 混在同一个 JSON 对象中！

${getStatusFieldDescription(taskType)}
- 段落序号(i)与原文1:1对应${onlyChanged}
- ${taskType === 'translation' ? '系统自动验证缺失段落（必须全覆盖）' : '仅需返回修改过的段落'}，所有阶段可用工具
- ⛔ 除working状态时禁止输出翻译（p字段）
`;
}

/**
 * 获取执行工作流说明（精简版）
 */
export function getExecutionWorkflowRules(taskType: TaskType): string {
  const workingFocus: Record<string, string> = {
    translation: '1:1翻译，敬语按流程处理，新术语/角色确认后创建',
    polish: '语气词优化、摆脱翻译腔、节奏调整、角色语言区分',
    proofreading: '文字（错别字/标点/语法）、内容（一致性/逻辑）、格式检查',
    chapter_summary: '生成章节摘要：概括主要情节、关键人物和事件，控制在200字以内',
  };

  const focus = workingFocus[taskType] || '按要求执行任务';

  if (taskType === 'translation') {
    return `【执行流程】
1. **planning**: 获取上下文信息，检查数据问题并修复
2. **working**: ${focus}；发现新信息立即更新
3. **review**: 系统复核完整性，更新数据，创建记忆
4. **end**: 完成当前块`;
  }

  return `【执行流程】
1. **planning**: 获取上下文信息，检查数据问题并修复
2. **working**: ${focus}；发现新信息立即更新
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
  const taskLabel = TASK_TYPE_LABELS[taskType];
  const askUserLine = !skipAskUser
    ? '- **询问**: 当有需要用户确认/做决定时，用 `ask_user_batch` 一次性解决所有疑问\n'
    : '';
  return `${getToolScopeRules(tools)}

【工具使用建议】
- 用途：获取上下文、维护术语/角色/记忆、查询历史翻译、查询待办事项。
- 优先用本地数据，网络工具仅用于外部知识
${askUserLine}- 最小必要：拿到信息后立刻回到${taskLabel}输出
- ${getTodoToolsDescription(taskType)}`;
}
