export default {
  aiState: {
    labels: {
      translation: '翻译',
      polish: '润色',
      proofreading: '校对',
      assistant: '助手',
      termsTranslation: '术语翻译',
    },
    planning:
      '当前状态：规划阶段 (planning)。上下文中的术语、角色、记忆已为最新；按待办确认，仅在缺失时查询。此处为输出前唯一的数据维护窗口，可创建/更新术语、角色、记忆。禁止提交{task}结果。全部待办 done 后调用 {transition}。',
    brief:
      '当前状态：简短规划 (planning)。沿用前一部分的规划上下文；仅补充当前需要的信息或数据。全部待办 done 后调用 {transition}。',
    working:
      '当前状态：{task}中 (working)。{focus}禁止创建/更新术语、角色、记忆，请在 {maintenance} 处理。用 add_translation_batch 提交结果，单次最多 {max} 段。{changed}按待办逐批完成并标记 done，之后调用 {transition}。',
    focusTranslation: '保持原文与译文 1:1 对应，依据实际原文处理称呼和适用敬语。',
    focusPolish: '改善目标语言的语气、表达自然度与节奏。',
    focusProofread: '检查文字、标点、语法、内容一致性、逻辑和格式。',
    changed: '仅返回有变化的段落。润色和校对没有 review 阶段。',
    review:
      '当前状态：复核 (review)。按待办检查，使用 add_translation_batch 修正；可更新术语、角色、记忆。全部待办 done 后调用 {transition}。',
    end: '当前状态：完成 (end)。{next}任务已结束，不再调用工具或输出内容，直接结束本次会话。',
    next: '当前块已完成，系统将提供下一块。',
    last: '全部内容已处理，这是最后一块。',
    planningLoop: '规划停留过久，请立即进入{task}输出阶段。调用 {transition}，不要继续 planning。',
    planningContinue: '必要信息与数据维护准备好后调用 {transition}。如仍缺信息，先调用工具补充。',
    briefContinue:
      '沿用前一部分的术语、角色和记忆。仅调用当前需要的工具；必要时预览相邻段落，按实际原文处理称呼，再进入 working。',
    workingLoop:
      '工作阶段停留过久，请立即提交{task}结果。使用 add_translation_batch 和 paragraph_id，单次最多 {max} 段。{changed}',
    noChanges: '没有需要修改的段落时可调用 {transition} 结束；否则仅提交变化段落。',
    finished: '全部段落的{task}已完成；无需继续时调用 {transition}。{note}',
    noReview: '润色和校对禁止 review，直接 end。',
    continue: '继续{task}，完成后调用 {transition}。',
    missing:
      '{count} 段缺少{task}结果，paragraph_id：{ids}。直接用 add_translation_batch 补齐，单次最多 {max} 段；仅修复缺失项，禁止重排或猜测 ID。',
    reviewLoop:
      '复核停留过久。有问题用 add_translation_batch 修正；无后续操作时立即调用 {transition}。',
    restricted:
      '当前状态 {status} 禁止工具 {tool} 写入数据。仅在 {stages} 维护术语、角色、记忆；end 后不再写入。',
    unauthorized:
      '工具 {tool} 未在本次 tools 列表中，禁止调用。使用可用工具或现有上下文继续{task}。',
    limit: '工具 {tool} 调用已达上限 {limit}，请使用已取得的信息继续。',
    repeated: '该工具结果已在规划上下文中，后续区块无需重复调用。',
    gate: '无法进入 {status}：仍有 {count} 个未完成待办。\n{items}\n请完成后再切换状态。',
    invalidTransition: '状态转换 {previous} → {next} 不合法，请按工作流程继续。',
  },
  aiRun: {
    init: {
      translation: '正在初始化翻译会话...',
      polish: '正在初始化润色会话...',
      proofreading: '正在初始化校对会话...',
    },
    connecting: '正在建立连接...',
    chunk: {
      translation: '正在翻译第 {current}/{total} 部分...',
      polish: '正在润色第 {current}/{total} 部分...',
      proofreading: '正在校对第 {current}/{total} 部分...',
    },
    single: {
      translation: '正在翻译段落...',
      polish: '正在润色段落...',
      proofreading: '正在校对段落...',
    },
    working: {
      translation: '正在翻译中...',
      polish: '正在润色中...',
      proofreading: '正在校对中...',
    },
    done: {
      translation: '翻译完成',
      polish: '润色完成',
      proofreading: '校对完成',
    },
    failed: {
      translation: '翻译出错',
      polish: '润色出错',
      proofreading: '校对出错',
    },
    unknownError: {
      translation: '翻译时发生未知错误',
      polish: '润色时发生未知错误',
      proofreading: '校对时发生未知错误',
    },
    emptyContent: {
      translation: '要翻译的内容不能为空',
      polish: '要润色的内容不能为空',
      proofreading: '要校对的内容不能为空',
    },
    needsTranslation: {
      translation: '要翻译的段落必须包含当前选中的翻译',
      polish: '要润色的段落必须包含当前选中的翻译',
      proofreading: '要校对的段落必须包含当前选中的翻译',
    },
    incomplete: {
      translation: '翻译任务未完成（状态：{status}）。请重试。',
      polish: '润色任务未完成（状态：{status}）。请重试。',
      proofreading: '校对任务未完成（状态：{status}）。请重试。',
    },
    retriesExhausted: {
      translation: '翻译任务重试 {max} 次后仍未完成',
      polish: '润色任务重试 {max} 次后仍未完成',
      proofreading: '校对任务重试 {max} 次后仍未完成',
    },
    maxTurns: {
      translation: 'AI 在 {turns} 回合内未完成翻译任务（当前状态：{status}）。请重试。',
      polish: 'AI 在 {turns} 回合内未完成润色任务（当前状态：{status}）。请重试。',
      proofreading: 'AI 在 {turns} 回合内未完成校对任务（当前状态：{status}）。请重试。',
    },
    degraded: 'AI 输出出现重复字符，已停止本次请求',
    retrying: '检测到 AI 输出异常，正在重试第 {count}/{max} 次...',
    degradedFinal: 'AI 输出持续出现重复字符，已重试 {max} 次仍失败。请检查 AI 服务状态或稍后重试。',
    modelDisabled: '所选模型未启用',
    cancelled: '已取消',
    cancelRequest: '请求已取消',
    emptyResult: 'AI 返回结果为空',
    emptyText: 'AI 返回的文本为空',
    term: {
      analyzing: '正在分析文本...',
      generating: '正在生成翻译...',
      retryingJson: '正在重试获取规范 JSON 输出...',
      done: '翻译完成',
      unknownError: '翻译时发生未知错误',
      emptyText: '要翻译的文本不能为空',
      noJson: '未找到有效的 JSON 格式',
      missingField: 'JSON 中缺少 t/translation 字段',
      formatError: 'AI 响应格式错误：{detail}。已达到最大重试次数，无法获取有效翻译。',
      termUnsupported: '所选模型不支持术语翻译任务',
      translationUnsupported: '所选模型不支持翻译任务',
    },
    batchAction: '批量处理 {count} 个段落 ({preview}{suffix})',
    summaryToolCall: '工具调用 {name} ({id}): {content}',
    summaryToolResult: '工具结果 {name} ({id}): {content}',
  },
};
