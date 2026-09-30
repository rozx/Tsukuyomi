export default {
  aiValidation: {
    sourceKept: '段落 {id} 已原样提交。已符合目标语言的内容允许保持原文，无需为改变文字而改写。',
  },
  aiTasks: {
    explain:
      '请用{dialogLanguage}简短解释以下文本的含义、语法、文化背景，以及与当前书籍的关联。自动判断原文语言；按需要分别解释混合语言内容：\n\n{text}',
    term: {
      base: '你是小说翻译助手。自动判断每段原文的语言，将术语译为自然、准确的{targetLanguage}。原文已经符合目标语言时保留原文；简繁中文视为不同目标。\n\n',
      rules:
        '【核心规则】\n1. 使用目标语言的术语表和角色表，保持译名一致。\n2. 结合书籍、章节与原文语境理解术语，保留原文格式和结构。\n3. 翻译所有需要转换的词语；已符合目标语言的内容、专有名词和符号可保留。混合语言文本按需要分别处理。\n4. 只返回 JSON，使用 t 表示译文。不要附加说明或代码块。示例：{example}\n\n',
      user: '请将以下术语译为{targetLanguage}，自动判断原文语言并保留格式和结构。只返回 JSON（t 为译文），不要附加说明或代码块。示例：{example}\n\n待翻译术语：\n\n{text}{relatedContextInfo}',
      retry: '响应格式错误。请只返回 JSON（t 为译文），不要附加说明或代码块。示例：{example}',
      example: '翻译结果',
      related: '\n\n相关背景信息（从当前书籍中匹配到）：\n',
      characters: '登场角色：\n{details}\n',
      terms: '相关术语：\n{details}\n',
      sex: '性别：{value}',
      description: '描述：{value}',
      speakingStyle: '说话风格：{value}',
      male: '男',
      female: '女',
      other: '其他',
      unset: '未设置',
      none: '无',
    },
    context: { aliases: '别名：{aliases}' },
  },
};
