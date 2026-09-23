export const importPatternSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['literal', 'regex'] },
    pattern: {
      type: 'string',
      description: '1–1000 字符。regex 不带 / 分隔符；JSON 内反斜杠须转义。',
    },
    flags: {
      type: 'string',
      description: '支持 g、i、m、s、u；默认全局、Unicode；如 im 表示忽略大小写、多行。',
    },
  },
  required: ['mode', 'pattern'],
};

export const importSourceFilterSchema = {
  type: 'object',
  properties: { name: importPatternSchema, locator: importPatternSchema },
  description:
    '在显式传入的来源/发现或目录窗口内筛选；name 匹配名称，locator 匹配 URL/文件路径，多条件取交集，不扩大来源范围。',
};
