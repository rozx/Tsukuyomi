import helpFeedback from './help-feedback';
import paragraphFeedback from './paragraph-feedback';
import batchFeedback from './batch-feedback';
export default {
  ...helpFeedback,
  ...paragraphFeedback,
  ...batchFeedback,
  aiToolFeedback: {
    unknownTool: '未知的工具: {tool}',
    unknownError: '未知错误',
    truncated:
      '工具参数疑似被截断（输出可能达到 token 上限）。请缩小单次提交的内容量（例如减少批次段落数）后重试。',
    parseFailed: '无法解析工具参数: {detail}',
  },
};
