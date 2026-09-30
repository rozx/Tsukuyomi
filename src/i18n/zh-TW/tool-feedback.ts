import importErrors from './import-errors';
import helpFeedback from './help-feedback';
export default {
  ...importErrors,
  ...helpFeedback,
  aiToolFeedback: {
    toolPairIdentity: '工具結果身分不一致',
    toolPairMissing: '工具沒有完成結果或讓出原因',
    toolNotAllowed: '工具不在目前執行設定中',
    incompleteCallJson: '工具參數不是完整 JSON',
    incompleteCallObject: '工具參數必須是物件',
    unknownTool: '未知的工具: {tool}',
    unknownError: '未知錯誤',
    truncated:
      '工具參數疑似遭截斷（輸出可能達到 token 上限）。請減少單次提交的內容量（例如批次段落數）後重試。',
    parseFailed: '無法解析工具參數: {detail}',
  },
};
