/**
 * /import 页面的业务状态。dispatcher 调 `provideImportPage()`，三个设备变体调
 * `injectImportPage()`；一次性初始化与路由同步只在 dispatcher 挂载时执行一次，
 * 断点切换换掉变体不会重复初始化或启动 Agent。
 */
import { computed, inject, onMounted, provide, ref, watch, type InjectionKey } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import { useUiStore } from 'src/stores/ui';
import {
  ImportPreviewService,
  type ImportChapterPreview,
} from 'src/services/import/import-preview-service';

export type ImportSection = 'tasks' | 'sources' | 'draft' | 'plan';

function createImportPage() {
  const store = useImportWorkspaceStore();
  const ui = useUiStore();
  const route = useRoute();
  const router = useRouter();

  const ready = ref(false);
  const selectedChapterId = ref<string | null>(null);
  const preview = ref<ImportChapterPreview | null>(null);
  const previewError = ref<string | null>(null);
  const previewLoading = ref(false);
  const selectedSourceId = ref<string | null>(null);
  const sourceText = ref<{ sourceId: string; text: string; nextOffset?: number } | null>(null);
  const sourceTextError = ref<string | null>(null);
  const section = ref<ImportSection>('draft');
  let previewToken = 0;

  const routeTaskId = computed(() => {
    const value = route.params.taskId;
    return typeof value === 'string' && value ? value : null;
  });

  async function syncRoute(): Promise<void> {
    const id = routeTaskId.value;
    if (id && !store.tasks.some((task) => task.id === id)) {
      await router.replace('/import');
      return;
    }
    if (id !== store.selectedTaskId) await store.selectTask(id);
    if (!id) section.value = 'tasks';
  }

  onMounted(async () => {
    await store.initialize();
    await syncRoute();
    ready.value = true;
  });
  watch(routeTaskId, () => {
    if (ready.value) void syncRoute();
  });

  function openTask(taskId: string): void {
    section.value = 'draft';
    void router.push(`/import/${taskId}`);
  }

  async function createTask(): Promise<void> {
    const task = await store.createTask();
    section.value = 'sources';
    await router.push(`/import/${task.id}`);
  }

  async function deleteTask(taskId: string): Promise<void> {
    const removed = await store.deleteTask(taskId);
    if (removed && routeTaskId.value === taskId) await router.replace('/import');
  }

  async function loadPreview(chapterId: string): Promise<void> {
    const taskId = store.selectedTaskId;
    if (!taskId) return;
    const token = ++previewToken;
    previewLoading.value = true;
    previewError.value = null;
    try {
      const result = await ImportPreviewService.chapter(taskId, chapterId);
      if (token === previewToken) preview.value = result;
    } catch (error) {
      if (token === previewToken) {
        preview.value = null;
        previewError.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (token === previewToken) previewLoading.value = false;
    }
  }

  function selectChapter(chapterId: string | null): void {
    selectedChapterId.value = chapterId;
    if (chapterId) void loadPreview(chapterId);
    else preview.value = null;
  }

  /** 查看来源的原始或已保存内容（分页读取，不触发新的抓取或解析）。 */
  async function showSource(sourceId: string, offset = 0): Promise<void> {
    selectedSourceId.value = sourceId;
    sourceTextError.value = null;
    const taskId = store.selectedTaskId;
    if (!taskId) return;
    const previous = sourceText.value?.sourceId === sourceId ? sourceText.value.text : '';
    try {
      const page = await ImportPreviewService.source(taskId, sourceId, { offset });
      if (page.kind === 'note') {
        sourceText.value = null;
        sourceTextError.value = page.note;
        return;
      }
      // 续读时接在已显示内容之后
      sourceText.value = {
        sourceId,
        text: offset ? previous + page.text : page.text,
        ...(page.nextOffset !== undefined ? { nextOffset: page.nextOffset } : {}),
      };
    } catch (error) {
      sourceText.value = null;
      sourceTextError.value = error instanceof Error ? error.message : String(error);
    }
  }

  function closeSource(): void {
    selectedSourceId.value = null;
    sourceText.value = null;
    sourceTextError.value = null;
  }

  function openChat(): void {
    ui.setActiveRightTab('chat');
    if (!ui.rightPanelOpen) ui.openRightPanel();
  }

  // 任务切换时清空章节与来源的查看状态；草稿更新后刷新当前预览
  watch(
    () => store.selectedTaskId,
    () => {
      selectedChapterId.value = null;
      preview.value = null;
      closeSource();
    },
  );
  watch(
    () => store.task?.draft.revision,
    () => {
      const id = selectedChapterId.value;
      if (!id) return;
      if (store.task?.draft.chapters.some((chapter) => chapter.id === id)) void loadPreview(id);
      else selectChapter(null);
    },
  );

  return {
    ready,
    routeTaskId,
    section,
    selectedChapterId,
    preview,
    previewError,
    previewLoading,
    selectedSourceId,
    sourceText,
    sourceTextError,
    openTask,
    createTask,
    deleteTask,
    selectChapter,
    showSource,
    closeSource,
    openChat,
  };
}

export type ImportPageContext = ReturnType<typeof createImportPage>;

const IMPORT_PAGE_KEY: InjectionKey<ImportPageContext> = Symbol('import-page');

export function provideImportPage(): ImportPageContext {
  const ctx = createImportPage();
  provide(IMPORT_PAGE_KEY, ctx);
  return ctx;
}

export function injectImportPage(): ImportPageContext {
  const ctx = inject(IMPORT_PAGE_KEY);
  if (!ctx) throw new Error('injectImportPage() 必须在 ImportPage dispatcher 内使用');
  return ctx;
}
