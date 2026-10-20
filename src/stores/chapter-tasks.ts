import { defineStore, acceptHMRUpdate } from 'pinia';

type ChapterTaskProgress = { current: number; total: number; message: string };

export type ChapterTranslationState = {
  isTranslating: boolean;
  progress: ChapterTaskProgress;
  abortController: AbortController | null;
  translatingParagraphIds: Set<string>;
};

export type ChapterPolishState = {
  isPolishing: boolean;
  progress: ChapterTaskProgress;
  abortController: AbortController | null;
  polishingParagraphIds: Set<string>;
};

export type ChapterProofreadingState = {
  isProofreading: boolean;
  progress: ChapterTaskProgress;
  abortController: AbortController | null;
  proofreadingParagraphIds: Set<string>;
};

/**
 * 章节级翻译 / 润色 / 校对任务的 UI 状态（按章节 ID 分别跟踪）。
 *
 * 任务在后台运行，不随书籍详情页卸载而停止；状态放在 store 里，
 * 离开页面再回来时才能继续显示进度、并能取消卸载前启动的任务。
 */
export const useChapterTasksStore = defineStore('chapterTasks', {
  state: () => ({
    translation: new Map<string, ChapterTranslationState>(),
    polish: new Map<string, ChapterPolishState>(),
    proofreading: new Map<string, ChapterProofreadingState>(),
  }),
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useChapterTasksStore, import.meta.hot));
}
