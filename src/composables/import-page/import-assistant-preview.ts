/**
 * 手机导入页顶部的「月詠在做什么」预览：对话收进抽屉后，原本只在对话里看得到的信息
 * （必答问题、对话错误、压缩、运行输出）要在预览里露出来，提示用户打开对话。
 * 纯函数，只用 store 里现成的轻量字段，不重新生成对话消息。
 */

export interface ImportAssistantPreviewInput {
  /** 当前任务状态的显示文案（草稿、已暂停……） */
  stateLabel: string;
  running: boolean;
  compacting: boolean;
  /** 流式输出的文本（运行中） */
  streamingText?: string;
  /** 只在对话里显示的错误 */
  error?: string;
  /** 待回答的必答问题 */
  question?: string;
  /** 月詠最近一条回复的文本（空闲时作为预览） */
  lastReply?: string;
}

export interface ImportAssistantPreview {
  tone: 'attention' | 'error' | 'active' | 'idle';
  status: string;
  detail: string;
}

interface PreviewLabels {
  question: string;
  error: string;
  compacting: string;
  running: string;
  idleHint: string;
}

const MAX_DETAIL = 60;

/** 按行去掉 Markdown 标记（标题、列表、引用符号与强调符号），丢弃空行 */
function plainLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[*_`~]/g, '')
        .replace(/^\s*(#{1,6}\s+|[-+>]\s+|\d+\.\s+)/, '')
        .trim(),
    )
    .filter(Boolean);
}

/** 流式文本的最后一行，太长时只保留结尾（正在写的内容） */
function streamingTail(text: string | undefined): string {
  if (!text) return '';
  const lines = plainLines(text);
  const last = lines[lines.length - 1] ?? '';
  return last.length > MAX_DETAIL ? `…${last.slice(-MAX_DETAIL)}` : last;
}

/** 回复的开头（合并为一行），太长时只保留开头——与聊天列表的消息预览一致 */
function replyHead(text: string | undefined): string {
  if (!text) return '';
  const joined = plainLines(text).join(' ');
  return joined.length > MAX_DETAIL ? `${joined.slice(0, MAX_DETAIL)}…` : joined;
}

export function buildImportAssistantPreview(
  input: ImportAssistantPreviewInput,
  labels: PreviewLabels,
): ImportAssistantPreview {
  if (input.question) {
    return { tone: 'attention', status: labels.question, detail: input.question };
  }
  if (input.error) return { tone: 'error', status: labels.error, detail: input.error };
  if (input.compacting) return { tone: 'active', status: labels.compacting, detail: '' };
  if (input.running) {
    return { tone: 'active', status: labels.running, detail: streamingTail(input.streamingText) };
  }
  return {
    tone: 'idle',
    status: input.stateLabel,
    detail: replyHead(input.lastReply) || labels.idleHint,
  };
}
