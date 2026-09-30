/** 自有说明的身份随错误跨 Worker、检查点和任务记录传递；历史纯文字仍保留。 */
export interface ImportFailure {
  code: string;
  message: string;
  localization?: {
    key: string;
    maxLength?: number;
    values: Record<string, string | number | ImportFailure>;
  };
}

/** 自有说明携带身份；旧记录和用户说明继续使用字符串。 */
export type ImportNotice = string | ImportFailure;
