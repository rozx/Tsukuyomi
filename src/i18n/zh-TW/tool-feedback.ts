import helpFeedback from './help-feedback';
import paragraphFeedback from './paragraph-feedback';
import batchFeedback from './batch-feedback';
export default {
  ...helpFeedback,
  ...paragraphFeedback,
  ...batchFeedback,
  aiToolFeedback: {
    unknownTool: '未知的工具: {tool}',
    unknownError: '未知錯誤',
    truncated:
      '工具參數疑似遭截斷（輸出可能達到 token 上限）。請減少單次提交的內容量（例如批次段落數）後重試。',
    parseFailed: '無法解析工具參數: {detail}',
  },
};
