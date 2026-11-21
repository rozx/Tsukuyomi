/**
 * 月詠桌宠的跟随、让位与头像状态规则（纯函数，便于测试）。
 * 行为契约见 openspec 的 desktop-corner-pet 规格。
 */

/** 桌宠可以跟随的一个运行中任务：章节任务（队列行）或助手对话 */
export interface DeskPetTaskRef {
  /** 章节任务为队列行 ID，助手为 AI 任务 ID */
  id: string;
  kind: 'chapter' | 'assistant';
  bookId?: string;
  chapterId?: string;
}

/**
 * 当前可跟随的任务，按优先级排序：助手 > 正在阅读的章节 > 其他章节（保持队列顺序）。
 * 面板已经在显示的内容不再转述：任务中心可见时剔除章节任务，助手面板打开时剔除助手。
 */
export function pickCandidates(input: {
  chapterTasks: readonly DeskPetTaskRef[];
  assistant: DeskPetTaskRef | null;
  readingChapter: { bookId: string; chapterId: string } | null;
  taskCenterVisible: boolean;
  assistantPanelOpen: boolean;
}): DeskPetTaskRef[] {
  const result: DeskPetTaskRef[] = [];
  if (input.assistant && !input.assistantPanelOpen) result.push(input.assistant);
  if (input.taskCenterVisible) return result;
  const reading = input.readingChapter;
  const isReading = (task: DeskPetTaskRef) =>
    !!reading && task.bookId === reading.bookId && task.chapterId === reading.chapterId;
  result.push(...input.chapterTasks.filter(isReading));
  result.push(...input.chapterTasks.filter((task) => !isReading(task)));
  return result;
}

/**
 * 当前跟随的任务 ID：手动选择优先（直到该任务结束）；正在跟随的任务还在候选里就保持；
 * 否则取优先级最高的候选。
 */
export function nextFollowed(
  currentId: string | null,
  candidates: readonly DeskPetTaskRef[],
  manualId: string | null,
): string | null {
  const has = (id: string | null) => !!id && candidates.some((task) => task.id === id);
  if (has(manualId)) return manualId;
  if (has(currentId)) return currentId;
  return candidates[0]?.id ?? null;
}

export type DeskPetMood = 'running' | 'review' | 'idle';

/** 头像状态：有运行中的可跟随任务为 running，否则有未查看的小结为 review，否则 idle */
export function petMood(input: { running: number; hasSummary: boolean }): DeskPetMood {
  if (input.running > 0) return 'running';
  return input.hasSummary ? 'review' : 'idle';
}
