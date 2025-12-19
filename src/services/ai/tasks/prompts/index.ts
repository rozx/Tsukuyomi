/**
 * 共享提示词模块
 * 用于提取和复用 AI 任务服务中的通用提示词部分
 */

import type { TaskType } from '../ai-task-helper';

/**
 * 获取全角符号格式规则
 * 用于确保翻译输出使用正确的中文标点符号
 */
export function getSymbolFormatRules(): string {
  return `**格式与符号保持**: ⚠️ **必须严格保持原文的格式和符号，并使用全角符号**
  - **必须使用全角符号**：所有标点符号、引号、括号、破折号等必须使用全角（中文）版本
    * 逗号：， （不是 ,）
    * 句号：。 （不是 .）
    * 问号：？ （不是 ?）
    * 感叹号：！ （不是 !）
    * 冒号：： （不是 :）
    * 分号：； （不是 ;）
    * 引号：" " 或 " " （不是 " "）
    * 括号：（） （不是 ()）
    * 破折号：—— （不是 - 或 --）
    * 省略号：…… （不是 ...）
  - 保持原文的换行、空格、缩进等格式特征
  - 特殊符号（如「」、『』等日文引号）必须原样保留或使用对应的中文全角符号
  - 数字、英文单词、特殊标记等非翻译内容必须完全保持原样（数字和英文保持半角）
  - 不要添加或删除任何符号，不要改变符号的位置和类型`;
}

/**
 * 获取敬语翻译工作流规则
 * ⚠️ 核心规则：严禁将敬语添加为别名
 */
export function getHonorificWorkflowRules(): string {
  return `========================================
【敬语翻译工作流（必须严格执行）】
========================================
遇到包含敬语的文本时，必须按以下顺序执行：

**步骤 1: 检查角色别名翻译（最高优先级）**
- 使用 \`get_character\` 或 \`search_characters_by_keywords\` 工具查找该角色
- 在角色的 \`aliases\` 列表中查找匹配的别名
- 如果文本中的角色名称（带敬语）与某个别名**完全匹配**，且该别名已有翻译（\`translation\` 字段），**必须直接使用该翻译**
- 如果别名中包含敬语但翻译为空，应使用 \`update_character\` 工具补充该别名的翻译
- ⚠️ **禁止自动创建新的敬语别名**
- ⚠️ **严禁将敬语（如"田中さん"、"太郎様"等）添加为别名**：敬语不能作为别名，只能作为已有别名的翻译补充

**步骤 2: 查看角色设定**
- 如果别名中没有找到匹配的翻译，查看角色的 \`description\` 字段
- 角色描述应包含**角色关系信息**（如"主角的妹妹"、"同班同学"、"上司"等）
- 如果描述中缺少关系信息，应使用 \`update_character\` 工具补充

**步骤 3: 检查历史翻译一致性（必须执行）**
- **首先**：使用 \`search_memory_by_keywords\` 工具搜索记忆中关于该角色敬语翻译的相关信息（如角色关系、敬语使用习惯等）
- **然后**：使用 \`find_paragraph_by_keywords\` 工具搜索该角色在之前段落中的翻译
- 如果提供 chapter_id 参数，则仅在指定章节内搜索；如果不提供，则搜索所有章节（从开头到当前）
- 如果找到之前的翻译或记忆中的相关信息，**必须保持一致**
- ⚠️ **重要**：如果找到记忆但发现信息需要更新（如角色关系变化、敬语翻译方式改变等），应使用 \`update_memory\` 工具更新记忆，确保记忆反映最新信息

**步骤 4: 应用角色关系**
- 根据角色描述中的关系信息决定翻译方式：
  * 亲密关系（妹妹、青梅竹马、好友）→ 可考虑省略敬语或使用亲密称呼
  * 正式关系（上司、老师、长辈）→ 必须保留敬语并翻译为相应中文敬语
  * 不明确关系 → 根据对话场景和上下文判断

**步骤 5: 翻译并保持一致性**
- 根据以上步骤确定翻译方式后进行翻译
- **不要**自动添加新的别名
- ⚠️ **严禁将敬语（如"田中さん"、"太郎様"等）添加为别名**
- 如果用户希望固定某个敬语翻译为别名，应由用户手动添加
- ⚠️ **重要**：如果在步骤3中搜索记忆时没有找到相关信息，在确定如何翻译敬语后，应使用 \`create_memory\` 工具创建记忆，保存该角色的敬语翻译方式和角色关系信息，以便后续快速参考
- ⚠️ **双重检查**：创建记忆前，必须确认**说话者是谁**以及**说话者和被称呼者之间的关系**，确保敬语翻译信息准确无误（敬语的翻译方式取决于说话者和被称呼者的关系）`;
}

/**
 * 获取术语管理工作流规则
 */
export function getTerminologyWorkflowRules(): string {
  return `========================================
【术语管理工作流】
========================================
**⚠️ 核心规则: 术语与角色严格分离**
- ✅ 术语表：专有名词、特殊概念、技能、地名、物品等
- ❌ 术语表中**绝对不能**包含角色名称（人名）
- ✅ 角色表：人物、角色名称、别名
- ❌ 角色表中**绝对不能**包含术语

**翻译前检查**:
1. 使用 \`list_terms\` 或 \`search_terms_by_keywords\` 工具获取相关术语
2. 确认术语/角色分离正确
3. 检查空翻译 → 使用 \`update_term\` 立即更新
4. 检查描述匹配 → 使用 \`update_term\` 更新

**翻译中处理**:
1. 发现空翻译 → 立即使用 \`update_term\` 更新
2. 发现需要新术语 → 直接使用 \`create_term\` 创建（无需检查词频）

**术语创建原则**:
- ✅ 应该添加：特殊用法（如网络用语、网络梗、流行语等）、专有名词、特殊概念、反复出现且翻译固定的词汇
- ❌ 不应该添加：仅由汉字组成且无特殊含义的普通词汇、常见助词、通用词汇

**术语维护**:
- 发现误分类的角色名称 → \`delete_term\` + \`create_character\`
- 发现无用术语 → \`delete_term\` 删除
- 发现重复术语 → \`delete_term\` 删除重复项`;
}

/**
 * 获取角色管理工作流规则
 */
export function getCharacterWorkflowRules(): string {
  return `========================================
【角色管理工作流】
========================================
**核心规则**:
- **主名称 (\`name\`)**: 必须是**全名**（如 "田中太郎"）
- **别名 (\`aliases\`)**: 名字或姓氏的**单独部分**（如 "田中"、"太郎"）
- ⚠️ **严禁将敬语（如"田中さん"、"太郎様"等）添加为别名**：敬语不能作为别名，只能作为已有别名的翻译补充

**翻译前检查**:
1. 使用 \`list_characters\` 或 \`search_characters_by_keywords\` 工具获取相关角色
2. 确认术语/角色分离正确
3. 检查空翻译 → 使用 \`update_character\` 立即更新
4. 检查描述/口吻 → 使用 \`update_character\` 更新
5. 检查重复角色 → 合并（删除重复，添加为别名）

**翻译中处理**:
1. 遇到新角色 → ⚠️ **先检查是否为已存在角色的别名**
   - 使用 \`list_characters\` 或 \`get_character\` 检查
   - 如果是全名且不存在 → 创建新角色（包含别名）
   - 如果是单独部分 → 检查是否为已存在角色的别名
2. 发现别名 → 使用 \`update_character\` 添加（⚠️ 先使用 \`list_characters\` 检查冲突）
3. 发现重复角色 → \`delete_character\` 删除重复，然后 \`update_character\` 添加为别名
4. 描述需补充 → 使用 \`update_character\` 更新
5. 发现特殊称呼 → 使用 \`update_character\` 更新

**角色创建原则**:
- 创建前必须检查：使用 \`list_characters\` 或 \`get_character\` 确认是否已存在
- 判断是全名还是别名：全名创建新角色，部分名检查是否为别名
- 创建时必须包含别名（如果已知）

**角色更新原则**:
1. **更新空翻译**: 发现翻译为空时立即使用 \`update_character\` 更新
2. **更新别名**:
   - 先使用 \`list_characters\` 检查别名是否属于其他角色（避免冲突）
   - 确认不冲突后使用 \`update_character\` 添加
   - ⚠️ 更新别名时，数组中只能包含该角色自己的别名
   - ⚠️ **严禁将敬语添加为别名**
3. **更新描述**:
   - 描述应包含：角色身份、角色性别（对代词翻译很重要）、角色关系（对敬语翻译很重要）、角色特征
   - 发现描述为空或不匹配时立即更新
4. **更新说话口吻**: 发现角色有独特语气、口癖时更新 \`speaking_style\`

**角色删除与合并**:
- 误分类的术语 → \`delete_character\` + \`create_term\`
- 重复角色 → 删除重复，添加为别名
- 主名称不是全名 → 更新为全名，原名称改为别名`;
}

/**
 * 获取记忆管理工作流规则
 */
export function getMemoryWorkflowRules(): string {
  return `========================================
【记忆管理工作流】
========================================
1. **参考记忆**:
   - 翻译前可使用 \`search_memory_by_keywords\` 搜索相关的背景设定、角色信息等记忆内容
   - 使用 \`get_memory\` 获取完整内容，确保翻译风格和术语使用的一致性
   - ⚠️ **重要**：翻译敬语时，必须**首先**使用 \`search_memory_by_keywords\` 搜索记忆中关于该角色敬语翻译的相关信息
   - ⚠️ **检查记忆时效性**：如果找到记忆，应检查信息是否仍然准确和最新。如果发现信息需要更新，应使用 \`update_memory\` 工具更新记忆
2. **保存记忆**:
   - 完成章节或者某个情节翻译后，推荐可使用 \`create_memory\` 保存章节摘要（需要自己生成 summary）
   - 重要背景设定也可保存供后续参考
   - ⚠️ **重要**：翻译敬语时，如果搜索记忆没有找到相关信息，在确定如何翻译敬语后，应使用 \`create_memory\` 创建记忆，保存该角色的敬语翻译方式和角色关系信息
   - ⚠️ **双重检查**：创建记忆前，必须确认说话者是谁以及说话者和被称呼者之间的关系
   - ⚠️ **更新记忆**：如果发现已有记忆中的信息需要更新，应使用 \`update_memory\` 工具更新记忆
3. **搜索后保存**:
   - 当你通过工具搜索或检索了大量内容时，应该主动使用 \`create_memory\` 保存这些重要信息
   - ⚠️ **更新已有记忆**：如果搜索后发现已有相关记忆但信息需要更新，应使用 \`update_memory\` 工具更新记忆`;
}

/**
 * 获取待办事项工具描述
 */
export function getTodoToolsDescription(taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskLabels[taskType];

  const examples = {
    translation: '翻译第1-5段，检查术语一致性，确保角色名称翻译一致',
    polish: '润色第1-5段，优化语气词使用，确保自然流畅',
    proofreading: '校对第1-5段，检查错别字和标点，确保术语一致性',
  };

  return `**待办事项管理**（用于任务规划）:
- \`create_todo\`: 创建待办事项来规划任务步骤（建议在开始复杂任务前使用）。⚠️ **重要**：创建待办事项时，必须创建详细、可执行的待办事项，而不是总结性的待办事项。每个待办事项应该是具体且可操作的，包含明确的任务范围和步骤。例如："${examples[taskType]}" 而不是 "${taskLabel}文本"
- ⚠️ **关键要求**：如果你规划了一个包含多个步骤的任务，**必须为每个步骤创建一个独立的待办事项**。不要只在文本中列出步骤，而应该使用 \`create_todo\` 为每个步骤创建实际的待办任务。
- **批量创建**：可以使用 \`items\` 参数一次性创建多个待办事项，例如：\`create_todo(items=["${taskLabel}第1-5段", "${taskLabel}第6-10段", "检查术语一致性"])\`。
- \`list_todos\`: 查看所有待办事项
- \`update_todos\`: 更新待办事项的内容或状态（支持单个或批量更新）
- \`mark_todo_done\`: 标记待办事项为完成（当你完成了该待办的任务时）
- \`delete_todo\`: 删除待办事项`;
}

/**
 * 获取状态字段说明
 */
export function getStatusFieldDescription(taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskLabels[taskType];

  const verificationNote =
    taskType === 'translation'
      ? '所有段落都有翻译'
      : `所有段落都有${taskLabel}（只验证有变化的段落）`;

  return `**状态字段说明（status）**:
- **"planning"**: 准备阶段，正在规划任务、获取上下文、创建待办事项等。在此阶段可以使用工具获取信息、规划任务。
- **"working"**: 工作阶段，正在${taskLabel}段落。可以输出部分${taskLabel}结果，状态保持为 "working" 直到完成所有段落。
- **"completed"**: 完成阶段，当前块的${verificationNote}。系统会验证${verificationNote}，如果缺少会要求继续工作。
- **"done"**: 完成阶段，所有后续操作（创建记忆、更新术语/角色、待办事项等）都已完成，可以进入下一个块。`;
}

/**
 * 获取输出格式要求
 */
export function getOutputFormatRules(taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskLabels[taskType];

  const onlyChangedNote =
    taskType !== 'translation'
      ? `
**⚠️ 重要：只返回有变化的段落**
- 如果段落经过${taskLabel}后有改进或变化，将其包含在 \`paragraphs\` 数组中
- 如果段落没有改进或变化，**不要**将其包含在 \`paragraphs\` 数组中
- 系统会自动比较${taskLabel}结果与原文，只有真正有变化的段落才会被保存为新翻译
- 如果所有段落都没有变化，返回：\`{"status": "completed", "paragraphs": []}\``
      : '';

  const titleNote =
    taskType === 'translation'
      ? `
- 如果有章节标题，必须包含 \`titleTranslation\` 字段`
      : '';

  return `========================================
【输出格式要求（必须严格遵守）】
========================================
**⚠️ 重要：只能返回JSON，禁止使用翻译管理工具**
- ❌ **禁止使用** \`add_translation\`、\`update_translation\`、\`remove_translation\`、\`select_translation\` 等翻译管理工具
- ✅ **必须直接返回** JSON 格式的${taskLabel}结果
- 系统会自动处理翻译的保存和管理，你只需要返回${taskLabel}内容

**必须返回有效的 JSON 格式，包含 status 字段**:
\`\`\`json
{
  "status": "working",
  "paragraphs": [
    { "id": "段落ID1", "translation": "${taskLabel === '翻译' ? '段落1的翻译' : `${taskLabel}后的段落1`}" },
    { "id": "段落ID2", "translation": "${taskLabel === '翻译' ? '段落2的翻译' : `${taskLabel}后的段落2`}" }
  ]${taskType === 'translation' ? ',\n  "titleTranslation": "章节标题翻译（仅当提供标题时）"' : ''}
}
\`\`\`

${getStatusFieldDescription(taskType)}
${onlyChangedNote}

**格式要求清单**:
- **必须包含 status 字段**，值必须是 "planning"、"working"、"completed" 或 "done" 之一
- ⚠️ **重要**：当只更新状态时（如从 planning 到 working，或只是状态更新），**不需要**包含 \`paragraphs\` 字段，只需返回 \`{"status": "状态值"}\` 即可
- 只有在实际提供${taskLabel}结果时，才需要包含以下字段：${titleNote}
  - \`paragraphs\` 数组中每个对象必须包含 \`id\` 和 \`translation\`
  - 段落 ID 必须与原文**完全一致**
  - 段落数量必须**1:1 对应**（不能合并或拆分段落）
  - 确保 \`paragraphs\` 数组包含所有输入段落的 ID 和对应${taskLabel}
  - ⚠️ **重要**：忽略空段落（原文为空或只有空白字符的段落），不要为这些段落输出${taskLabel}内容，系统也不会将它们计入有效段落
- 必须是有效的 JSON（注意转义特殊字符）
- **不要使用任何翻译管理工具，只返回JSON**
- **在所有状态阶段都可以使用工具**（planning、working、completed、done）`;
}

/**
 * 获取执行工作流说明
 */
export function getExecutionWorkflowRules(taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskLabels[taskType];

  const verificationNote =
    taskType === 'translation'
      ? '所有段落都有翻译'
      : `所有段落都有${taskLabel}（只验证有变化的段落）`;

  const workingDetails = {
    translation: `- 逐段翻译，确保 1:1 对应
     - 遇到敬语时，严格按照【敬语翻译工作流】执行
     - 遇到新术语时，确认需要后直接创建（无需检查词频）
     - 遇到新角色时，先检查是否为别名，确认是新角色后创建
     - 发现数据问题（空翻译、描述不匹配、重复项）时立即修复`,
    polish: `- 语气词优化：适当添加符合角色风格的语气词
     - 摆脱翻译腔：将生硬的直译转换为自然流畅的中文表达
     - 节奏优化：调整句子长度和结构，确保阅读节奏自然
     - 语病修正：修正语法错误和表达不当，删除冗余表达
     - 角色区分：确保不同角色的对白符合其身份、性格和时代背景
     - 专有名词统一：确保术语和角色名称在全文中保持一致`,
    proofreading: `- **文字层面**：逐字检查错别字、标点、语法、词语用法
     - **内容层面**：检查人名、地名、称谓是否一致；检查时间线和逻辑是否合理；检查专业知识/设定是否准确
     - **格式层面**：检查格式、数字用法、引文注释是否规范
     - 如发现不一致，使用工具（如 find_paragraph_by_keywords）查找其他段落中的用法，确保一致性`,
  };

  return `========================================
【执行工作流（基于状态）】
========================================
${taskLabel}每个文本块时，按以下状态流程执行：

1. **规划阶段（status: "planning"）**:
   - 使用工具获取上下文（如 list_terms、list_characters、search_terms_by_keywords、search_characters_by_keywords 等）
   - ⚠️ **重要**：如果提供了章节 ID，调用 \`list_terms\` 和 \`list_characters\` 时应传递 \`chapter_id\` 参数
   - 检查术语/角色分离是否正确
   - 检查是否有空翻译需要补充
   - 检查是否有描述不匹配需要更新
   - 可以使用工具获取上下文、创建待办事项等
   - 当准备好开始${taskLabel}时，将状态设置为 "working"

2. **工作阶段（status: "working"）**:
   ${workingDetails[taskType]}
   - 可以输出部分${taskLabel}结果，状态保持为 "working"
   - 可以使用工具进行任何需要的操作
   - 当完成所有段落${taskLabel}时，将状态设置为 "completed"

3. **完成阶段（status: "completed"）**:
   - 系统会自动验证${verificationNote}
   - 如果缺少${taskLabel}，系统会要求继续工作（状态回到 "working"）
   - 如果所有段落都完整，系统会询问是否需要后续操作
   - 可以使用工具进行后续操作（创建记忆、更新术语/角色、管理待办事项等）
   - 当所有后续操作完成时，将状态设置为 "done"

4. **最终完成（status: "done"）**:
   - 所有操作已完成
   - 系统会进入下一个文本块或完成整个任务`;
}

/**
 * 获取工具使用说明
 */
export function getToolUsageInstructions(taskType: TaskType): string {
  const taskLabels = {
    translation: '翻译',
    polish: '润色',
    proofreading: '校对',
  };
  const taskLabel = taskLabels[taskType];

  const highFrequencyTools = `1. **高频必用**:
   - \`search_memory_by_keywords\`: ${taskType === 'translation' ? '敬语翻译前先搜索记忆' : `${taskLabel}前先搜索记忆`}
   - \`find_paragraph_by_keywords\`: 敬语翻译、术语一致性检查（支持多个关键词。如果提供 chapter_id 参数，则仅在指定章节内搜索）
   - \`update_character\`: 补充翻译、添加别名、更新描述
   - \`update_term\`: 补充术语翻译
   - \`list_characters\`: 检查别名冲突、查找重复角色。⚠️ 如果提供了章节 ID，应传递 \`chapter_id\` 参数
   - \`list_terms\`: 获取术语列表。⚠️ 如果提供了章节 ID，应传递 \`chapter_id\` 参数
   - \`create_memory\`: 保存重要信息以便后续快速参考
   - \`update_memory\`: 更新记忆中需要更新的信息
   - \`delete_memory\`: 删除不再需要的记忆`;

  const asNeededTools = `2. **按需使用**:
   - \`create_character\` / \`create_term\`: 确认需要时直接创建
   - \`delete_character\` / \`delete_term\`: 清理无用或重复项
   - \`get_previous_paragraphs\` / \`get_next_paragraphs\`: 需要更多上下文时
   - \`get_previous_chapter\` / \`get_next_chapter\`: 需要查看前一个或下一个章节的上下文时
   - \`update_chapter_title\`: 更新章节标题（用于修正章节标题翻译）`;

  return `========================================
【工具使用说明】
========================================
**工具使用优先级**:
${highFrequencyTools}
${asNeededTools}
3. ${getTodoToolsDescription(taskType)}`;
}
