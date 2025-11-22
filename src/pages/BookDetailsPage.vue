<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DataView from 'primevue/dataview';
import Popover from 'primevue/popover';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Badge from 'primevue/badge';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useBooksStore } from 'src/stores/books';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { CoverService } from 'src/services/cover-service';
import { ChapterService } from 'src/services/chapter-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import { TerminologyService } from 'src/services/terminology-service';
import { TranslationService } from 'src/services/ai';
import {
  formatWordCount,
  getNovelCharCount,
  getTotalChapters,
  getChapterCharCount,
  getChapterContentText,
  getVolumeDisplayTitle,
  getChapterDisplayTitle,
} from 'src/utils';
import { generateShortId } from 'src/utils/id-generator';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type {
  Volume,
  Chapter,
  Novel,
  Terminology,
  CharacterSetting,
  Paragraph,
} from 'src/types/novel';
import BookDialog from 'src/components/dialogs/BookDialog.vue';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import TermEditDialog from 'src/components/dialogs/TermEditDialog.vue';
import CharacterEditDialog from 'src/components/dialogs/CharacterEditDialog.vue';
import TerminologyPanel from 'src/components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from 'src/components/novel/CharacterSettingPanel.vue';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';
import ParagraphCard from 'src/components/novel/ParagraphCard.vue';

const route = useRoute();
const router = useRouter();
const booksStore = useBooksStore();
const bookDetailsStore = useBookDetailsStore();
const aiModelsStore = useAIModelsStore();
const aiProcessingStore = useAIProcessingStore();
const toast = useToastWithHistory();

// 添加卷/章节对话框状态
const showAddVolumeDialog = ref(false);
const showAddChapterDialog = ref(false);
const newVolumeTitle = ref('');
const newChapterTitle = ref('');
const selectedVolumeId = ref<string | null>(null);

// 编辑卷/章节对话框状态
const showEditVolumeDialog = ref(false);
const showEditChapterDialog = ref(false);
const editingVolumeId = ref<string | null>(null);
const editingChapterId = ref<string | null>(null);
const editingVolumeTitle = ref('');
const editingVolumeTranslation = ref('');
const editingChapterTitle = ref('');
const editingChapterTranslation = ref('');
const editingChapterSourceVolumeId = ref<string | null>(null);
const editingChapterTargetVolumeId = ref<string | null>(null);

// 删除确认对话框状态
const showDeleteVolumeConfirm = ref(false);
const showDeleteChapterConfirm = ref(false);
const deletingVolumeId = ref<string | null>(null);
const deletingChapterId = ref<string | null>(null);
const deletingVolumeTitle = ref('');
const deletingChapterTitle = ref('');

// 书籍编辑对话框状态
const showBookDialog = ref(false);
const showScraperDialog = ref(false);

// 拖拽状态
const draggedChapter = ref<{
  chapter: Chapter;
  sourceVolumeId: string;
  sourceIndex: number;
} | null>(null);
const dragOverVolumeId = ref<string | null>(null);
const dragOverIndex = ref<number | null>(null);

// 设置菜单状态
const selectedSettingMenu = ref<'terms' | 'characters' | null>(null);

// 编辑模式状态
type EditMode = 'original' | 'translation' | 'preview';
const editMode = ref<EditMode>('translation');

// 原始文本编辑状态
const isEditingOriginalText = ref(false);
const originalTextEditValue = ref('');
const originalTextEditBackup = ref('');
const originalTextEditChapterId = ref<string | null>(null); // 跟踪正在编辑原始文本的章节 ID

// 从路由参数获取书籍 ID
const bookId = computed(() => route.params.id as string);

// 切换卷的展开/折叠状态
const toggleVolume = (volumeId: string) => {
  if (!bookId.value) return;
  void bookDetailsStore.toggleVolume(bookId.value, volumeId);
};

// 检查卷是否展开
const isVolumeExpanded = (volumeId: string): boolean => {
  if (!bookId.value) return false;
  return bookDetailsStore.isVolumeExpanded(bookId.value, volumeId);
};

// 获取书籍信息
const book = computed(() => {
  if (!bookId.value) return undefined;
  return booksStore.getBookById(bookId.value);
});

// 获取封面图片 URL
const getCoverUrl = (book: Novel): string => {
  return CoverService.getCoverUrl(book);
};

// 计算统计信息
const stats = computed(() => {
  if (!book.value) return null;
  return {
    wordCount: getNovelCharCount(book.value),
    chapterCount: getTotalChapters(book.value),
    volumeCount: book.value.volumes?.length || 0,
  };
});

// 获取卷列表
const volumes = computed(() => {
  if (!book.value || !book.value.volumes || book.value.volumes.length === 0) {
    return [];
  }
  return book.value.volumes;
});

// 卷选项（用于 Dropdown）
const volumeOptions = computed(() => {
  return volumes.value.map((volume) => ({
    label: getVolumeDisplayTitle(volume),
    value: volume.id,
  }));
});

// 导航到章节详情页
const navigateToChapter = (chapter: Chapter) => {
  if (!bookId.value) return;
  // 设置选中的章节
  void bookDetailsStore.setSelectedChapter(bookId.value, chapter.id);
  // 清除设置菜单选中状态
  selectedSettingMenu.value = null;
};

// 导航到术语设置
const navigateToTermsSetting = () => {
  selectedSettingMenu.value = 'terms';
  // 清除章节选中状态
  if (bookId.value) {
    void bookDetailsStore.setSelectedChapter(bookId.value, null);
  }
};

// 导航到角色设置
const navigateToCharactersSetting = () => {
  selectedSettingMenu.value = 'characters';
  // 清除章节选中状态
  if (bookId.value) {
    void bookDetailsStore.setSelectedChapter(bookId.value, null);
  }
};

// 打开从在线获取更新对话框
const openScraperDialog = () => {
  showScraperDialog.value = true;
};

// 处理从在线获取的更新
const handleScraperUpdate = async (novel: Novel) => {
  if (!book.value) {
    return;
  }

  try {
    // 使用 ChapterService 合并卷和章节
    const updatedBook = ChapterService.mergeNovelData(book.value, novel, {
      chapterUpdateStrategy: 'merge',
    });

    // 更新书籍
    await booksStore.updateBook(book.value.id, {
      ...updatedBook,
      lastEdited: new Date(),
    });

    showScraperDialog.value = false;
    toast.add({
      severity: 'success',
      summary: '更新成功',
      detail: '已从在线获取并更新章节数据',
      life: 3000,
    });
  } catch (error) {
    console.error('更新失败:', error);
    toast.add({
      severity: 'error',
      summary: '更新失败',
      detail: error instanceof Error ? error.message : '从在线获取更新时发生错误',
      life: 5000,
    });
  }
};

// 获取选中的章节 ID
const selectedChapterId = computed(() => {
  if (!bookId.value) return null;
  return bookDetailsStore.getSelectedChapter(bookId.value);
});

// 获取选中的章节对象
const selectedChapter = computed(() => {
  if (!book.value || !selectedChapterId.value) return null;

  for (const volume of book.value.volumes || []) {
    if (volume.chapters) {
      const chapter = volume.chapters.find((ch) => ch.id === selectedChapterId.value);
      if (chapter) {
        return chapter;
      }
    }
  }
  return null;
});

// 获取选中章节的段落列表
const selectedChapterParagraphs = computed(() => {
  if (!selectedChapter.value || !selectedChapter.value.content) {
    return [];
  }
  return selectedChapter.value.content;
});

// 获取选中章节的统计信息
const selectedChapterStats = computed(() => {
  if (!selectedChapter.value) return null;

  const paragraphCount = selectedChapterParagraphs.value.length;
  const charCount = getChapterCharCount(selectedChapter.value);

  return {
    paragraphCount,
    charCount,
  };
});

// 获取章节的原始文本内容（用于编辑）
const chapterOriginalText = computed(() => {
  if (!selectedChapter.value || !selectedChapter.value.content) {
    return '';
  }
  return selectedChapter.value.content.map((para) => para.text).join('\n');
});

// 获取段落的选中翻译文本
const getParagraphTranslationText = (paragraph: Paragraph): string => {
  if (!paragraph.selectedTranslationId || !paragraph.translations) {
    return '';
  }
  const selectedTranslation = paragraph.translations.find(
    (t) => t.id === paragraph.selectedTranslationId,
  );
  return selectedTranslation?.translation || '';
};

// 计算已翻译文本的总字符数
const translatedCharCount = computed(() => {
  if (!selectedChapterParagraphs.value.length) {
    return 0;
  }
  return selectedChapterParagraphs.value.reduce((total, paragraph) => {
    const translationText = getParagraphTranslationText(paragraph);
    return total + translationText.length;
  }, 0);
});

// 开始编辑原始文本
const startEditingOriginalText = () => {
  if (!isEditingOriginalText.value && selectedChapter.value) {
    originalTextEditValue.value = chapterOriginalText.value;
    originalTextEditBackup.value = chapterOriginalText.value;
    originalTextEditChapterId.value = selectedChapter.value.id;
    isEditingOriginalText.value = true;
  }
};

// 保存原始文本编辑
const saveOriginalTextEdit = async () => {
  if (!book.value || !selectedChapter.value) {
    return;
  }

  // 安全检查：验证正在编辑的章节与当前选中的章节一致
  if (originalTextEditChapterId.value !== selectedChapter.value.id) {
    toast.add({
      severity: 'warn',
      summary: '章节已切换',
      detail: '检测到章节已切换，请重新编辑当前章节',
      life: 3000,
    });
    // 重置编辑状态
    isEditingOriginalText.value = false;
    originalTextEditChapterId.value = null;
    editMode.value = 'translation';
    return;
  }

  try {
    // 将文本按换行符分割为段落（允许空段落）
    const textLines = originalTextEditValue.value.split('\n');

    // 获取现有段落以保留翻译
    const existingParagraphs = selectedChapter.value.content || [];

    // 更新段落文本，如果文本改变则清除翻译
    const updatedParagraphs: Paragraph[] = textLines.map((line, index) => {
      const existingParagraph = existingParagraphs[index];
      if (existingParagraph) {
        // 检查文本是否改变
        const textChanged = existingParagraph.text !== line;
        if (textChanged) {
          // 文本改变，清除翻译
          return {
            ...existingParagraph,
            text: line,
            selectedTranslationId: '',
            translations: [],
          };
        } else {
          // 文本未改变，保留翻译
          return {
            ...existingParagraph,
            text: line,
          };
        }
      } else {
        // 创建新段落
        return {
          id: generateShortId(),
          text: line,
          selectedTranslationId: '',
          translations: [],
        };
      }
    });

    // 更新章节内容
    const updatedVolumes = ChapterService.updateChapter(book.value, selectedChapter.value.id, {
      content: updatedParagraphs,
      lastEdited: new Date(),
    });

    // 先保存章节内容
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });

    // 刷新所有术语和角色的出现次数
    await TerminologyService.refreshAllTermOccurrences(book.value.id);
    await CharacterSettingService.refreshAllCharacterOccurrences(book.value.id);

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: '已更新原始文本',
      life: 3000,
    });

    isEditingOriginalText.value = false;
    originalTextEditChapterId.value = null;
    // 切换回翻译模式
    editMode.value = 'translation';
  } catch (error) {
    console.error('保存原始文本失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '保存原始文本时发生错误',
      life: 3000,
    });
  }
};

// 取消原始文本编辑
const cancelOriginalTextEdit = () => {
  originalTextEditValue.value = originalTextEditBackup.value;
  isEditingOriginalText.value = false;
  originalTextEditChapterId.value = null;
  // 切换回翻译模式
  editMode.value = 'translation';
};

// 编辑模式选项（只用于图标，不显示标签）
const editModeOptions = [
  { value: 'original', icon: 'pi pi-pencil', title: '原文编辑' },
  { value: 'translation', icon: 'pi pi-language', title: '翻译模式' },
  { value: 'preview', icon: 'pi pi-eye', title: '译文预览' },
] as const;

// 监听编辑模式变化
watch(editMode, (newMode: EditMode) => {
  if (newMode === 'original') {
    startEditingOriginalText();
  } else {
    if (isEditingOriginalText.value) {
      isEditingOriginalText.value = false;
      originalTextEditChapterId.value = null;
    }
  }
});

// 监听章节切换：当章节改变时，如果正在编辑，则重置编辑状态
watch(selectedChapterId, (newChapterId, oldChapterId) => {
  // 如果章节确实改变了，且正在编辑状态，则重置编辑状态
  if (oldChapterId !== null && newChapterId !== oldChapterId && isEditingOriginalText.value) {
    isEditingOriginalText.value = false;
    originalTextEditChapterId.value = null;
    // 如果当前在原始文本编辑模式，切换回翻译模式
    if (editMode.value === 'original') {
      editMode.value = 'translation';
    }
  }
});

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 术语弹出框状态
const termPopover = ref();
const showEditTermDialog = ref(false);
const editingTerm = ref<Terminology | null>(null);
const isSavingTerm = ref(false);

// 计算当前章节使用的术语列表
const usedTerms = computed(() => {
  if (!selectedChapter.value || !book.value?.terminologies?.length) {
    return [];
  }

  const text = getChapterContentText(selectedChapter.value);
  if (!text) return [];

  const terms = book.value.terminologies;
  // 按名称长度降序排序，优先匹配较长的术语
  const sortedTerms = [...terms].sort((a, b) => b.name.length - a.name.length);

  const termMap = new Map<string, Terminology>();
  for (const term of sortedTerms) {
    if (term.name && term.name.trim()) {
      termMap.set(term.name.trim(), term);
    }
  }

  const termNames = Array.from(termMap.keys())
    .map((name) => escapeRegex(name))
    .join('|');

  if (!termNames) return [];

  const regex = new RegExp(`(${termNames})`, 'g');
  const matchedTerms = new Map<string, Terminology>();

  let match;
  while ((match = regex.exec(text)) !== null) {
    const matchedName = match[0];
    const term = termMap.get(matchedName);
    if (term) {
      matchedTerms.set(term.id, term);
    }
  }

  return Array.from(matchedTerms.values());
});

const usedTermCount = computed(() => usedTerms.value.length);

const toggleTermPopover = (event: Event) => {
  termPopover.value.toggle(event);
};

// 角色设定弹出框状态
const characterPopover = ref();
const showEditCharacterDialog = ref(false);
const editingCharacter = ref<CharacterSetting | null>(null);
const isSavingCharacter = ref(false);

// 计算当前章节使用的角色设定列表
const usedCharacters = computed(() => {
  if (!selectedChapter.value || !book.value?.characterSettings?.length) {
    return [];
  }

  const text = getChapterContentText(selectedChapter.value);
  if (!text) return [];

  const characters = book.value.characterSettings;
  // 创建名称到角色的映射，包括角色名称和所有别名
  const nameToCharacterMap = new Map<string, CharacterSetting>();

  for (const char of characters) {
    // 添加角色名称
    if (char.name && char.name.trim()) {
      nameToCharacterMap.set(char.name.trim(), char);
    }
    // 添加所有别名
    if (char.aliases && char.aliases.length > 0) {
      for (const alias of char.aliases) {
        if (alias.name && alias.name.trim()) {
          nameToCharacterMap.set(alias.name.trim(), char);
        }
      }
    }
  }

  // 按名称长度降序排序，优先匹配较长的名称
  const sortedNames = Array.from(nameToCharacterMap.keys()).sort((a, b) => b.length - a.length);

  if (sortedNames.length === 0) return [];

  const namePatterns = sortedNames.map((name) => escapeRegex(name)).join('|');
  const regex = new RegExp(`(${namePatterns})`, 'g');
  const matchedCharacters = new Map<string, CharacterSetting>();

  let match;
  while ((match = regex.exec(text)) !== null) {
    const matchedName = match[0];
    const char = nameToCharacterMap.get(matchedName);
    if (char) {
      matchedCharacters.set(char.id, char);
    }
  }

  return Array.from(matchedCharacters.values());
});

const usedCharacterCount = computed(() => usedCharacters.value.length);

const toggleCharacterPopover = (event: Event) => {
  characterPopover.value.toggle(event);
};

// 翻译章节所有段落
const isTranslatingChapter = ref(false);
const translationProgress = ref({
  current: 0,
  total: 0,
  message: '',
});
const translationAbortController = ref<AbortController | null>(null);
const translatingParagraphIds = ref<Set<string>>(new Set());
const showAITaskHistory = ref(false);

// AI 任务类型和状态标签映射
const taskTypeLabels: Record<string, string> = {
  translation: '翻译',
  proofreading: '校对',
  polishing: '润色',
  characterExtraction: '角色提取',
  terminologyExtraction: '术语提取',
  termsTranslation: '术语翻译',
  config: '配置获取',
  other: '其他',
};

const taskStatusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  completed: '已完成',
  error: '错误',
  cancelled: '已取消',
};

// 获取最近的 AI 任务（包括进行中的和最近完成的）
const recentAITasks = computed(() => {
  const allTasks = aiProcessingStore.activeTasks;
  // 按开始时间倒序排列，取最近 10 个
  return [...allTasks].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
});

// 自动滚动状态（按任务 ID 存储）
const autoScrollEnabled = ref<Record<string, boolean>>({});

// 任务折叠状态（按任务 ID 存储，默认展开）
const taskFolded = ref<Record<string, boolean>>({});

// 切换任务的折叠/展开状态
const toggleTaskFold = (taskId: string) => {
  taskFolded.value[taskId] = !taskFolded.value[taskId];
};

// 切换任务的自动滚动
const toggleAutoScroll = (taskId: string) => {
  autoScrollEnabled.value[taskId] = !autoScrollEnabled.value[taskId];
  // 如果启用自动滚动，立即滚动到底部
  if (autoScrollEnabled.value[taskId]) {
    setTimeout(() => {
      const container = thinkingContainers.value[taskId];
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 0);
  }
};

// 清除已完成/已取消的任务
const clearCompletedTasks = async () => {
  try {
    await aiProcessingStore.clearCompletedTasks();
    toast.add({
      severity: 'success',
      summary: '清除成功',
      detail: '已清除所有已完成和已取消的任务',
      life: 3000,
    });
  } catch (error) {
    console.error('Failed to clear completed tasks:', error);
    toast.add({
      severity: 'error',
      summary: '清除失败',
      detail: error instanceof Error ? error.message : '未知错误',
      life: 3000,
    });
  }
};

// 思考过程容器的引用
const thinkingContainers = ref<Record<string, HTMLElement | null>>({});

// 设置思考过程容器引用
const setThinkingContainer = (taskId: string, el: HTMLElement | null) => {
  if (el) {
    thinkingContainers.value[taskId] = el;
  } else {
    // 清理卸载元素的引用，防止内存泄漏
    delete thinkingContainers.value[taskId];
  }
};

// 监听任务思考过程变化，自动滚动到底部
watch(
  () =>
    recentAITasks.value.map((task) => ({
      id: task.id,
      message: task.thinkingMessage,
      length: task.thinkingMessage?.length || 0,
    })),
  () => {
    // 使用 nextTick 确保 DOM 已更新后再滚动
    setTimeout(() => {
      for (const task of recentAITasks.value) {
        if (autoScrollEnabled.value[task.id] && task.thinkingMessage) {
          const container = thinkingContainers.value[task.id];
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }
    }, 0);
  },
  { deep: true, flush: 'post' },
);

// 格式化任务持续时间
const formatTaskDuration = (startTime: number, endTime?: number): string => {
  const end = endTime || Date.now();
  const duration = Math.floor((end - startTime) / 1000);
  if (duration < 60) {
    return `${duration}秒`;
  }
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}分${seconds}秒`;
};

const translateAllParagraphs = async () => {
  if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
    return;
  }

  // 检查是否有可用的翻译模型
  const selectedModel = aiModelsStore.getDefaultModelForTask('translation');
  if (!selectedModel) {
    toast.add({
      severity: 'error',
      summary: '翻译失败',
      detail: '未找到可用的翻译模型，请在设置中配置',
      life: 3000,
    });
    return;
  }

  isTranslatingChapter.value = true;
  translatingParagraphIds.value.clear();

  // 初始化进度
  translationProgress.value = {
    current: 0,
    total: 0,
    message: '正在初始化翻译...',
  };

  // 创建 AbortController 用于取消翻译
  const abortController = new AbortController();
  translationAbortController.value = abortController;

  // 用于跟踪已更新的段落，避免重复更新
  const updatedParagraphIds = new Set<string>();

  // 更新段落的辅助函数
  const updateParagraphsIncrementally = async (
    paragraphTranslations: { id: string; translation: string }[],
  ) => {
    if (!book.value || !selectedChapter.value) return;

    // 过滤出尚未更新的段落
    const newTranslations = paragraphTranslations.filter(
      (pt) => pt.id && pt.translation && !updatedParagraphIds.has(pt.id),
    );

    if (newTranslations.length === 0) return;

    // 标记这些段落为已更新
    newTranslations.forEach((pt) => updatedParagraphIds.add(pt.id));

    // 更新每个段落的翻译
    const updatedVolumes = book.value.volumes?.map((volume) => {
      if (!volume.chapters) return volume;

      const updatedChapters = volume.chapters.map((chapter) => {
        if (chapter.id !== selectedChapter.value!.id) return chapter;

        if (!chapter.content) return chapter;

        const updatedContent = chapter.content.map((para) => {
          const translation = newTranslations.find((pt) => pt.id === para.id);
          if (!translation) return para;

          // 创建新的翻译对象
          const newTranslation = {
            id: generateShortId(),
            translation: translation.translation,
            aiModelId: selectedModel.id,
          };

          // 添加到翻译列表
          const updatedTranslations = [...(para.translations || []), newTranslation];

          // 只更新翻译相关字段，确保不修改原文（text 字段）
          return {
            id: para.id,
            text: para.text, // 明确保留原文，不修改
            translations: updatedTranslations,
            selectedTranslationId: newTranslation.id,
          };
        });

        return {
          ...chapter,
          content: updatedContent,
          lastEdited: new Date(),
        };
      });

      return {
        ...volume,
        chapters: updatedChapters,
      };
    });

    // 更新书籍
    await booksStore.updateBook(book.value.id, {
      volumes: updatedVolumes,
      lastEdited: new Date(),
    });
  };

  try {
    const paragraphs = selectedChapterParagraphs.value;

    // 获取章节标题
    const chapterTitle = selectedChapter.value?.title?.original;

    // 调用翻译服务
    const result = await TranslationService.translate(paragraphs, selectedModel, {
      bookId: book.value.id,
      ...(chapterTitle ? { chapterTitle } : {}),
      signal: abortController.signal,
      aiProcessingStore: {
        addTask: aiProcessingStore.addTask.bind(aiProcessingStore),
        updateTask: aiProcessingStore.updateTask.bind(aiProcessingStore),
        appendThinkingMessage: aiProcessingStore.appendThinkingMessage.bind(aiProcessingStore),
        removeTask: aiProcessingStore.removeTask.bind(aiProcessingStore),
        activeTasks: aiProcessingStore.activeTasks,
      },
      onProgress: (progress) => {
        translationProgress.value = {
          current: progress.current,
          total: progress.total,
          message: `正在翻译第 ${progress.current}/${progress.total} 部分...`,
        };
        // 更新正在翻译的段落 ID
        if (progress.currentParagraphs) {
          translatingParagraphIds.value = new Set(progress.currentParagraphs);
        }
        console.debug('翻译进度:', progress);
      },
      onAction: (action) => {
        // 显示 CRUD 操作的 toast 通知
        const entityLabel = action.entity === 'term' ? '术语' : '角色';
        const typeLabel =
          action.type === 'create' ? '创建' : action.type === 'update' ? '更新' : '删除';

        let detail = '';
        if (action.type === 'delete') {
          // 删除操作时，data 可能是 { id: string }
          detail = `已删除${entityLabel}`;
        } else {
          // create 或 update 操作时，data 是 Terminology 或 CharacterSetting
          const data = action.data as Terminology | CharacterSetting;
          const name = data.name || '';
          detail = `${entityLabel} "${name}" 已${typeLabel}`;
        }

        toast.add({
          severity: 'success',
          summary: 'AI 操作完成',
          detail,
          life: 3000,
        });
      },
      onParagraphTranslation: (translations) => {
        // 立即更新段落翻译（异步执行，不阻塞）
        void updateParagraphsIncrementally(translations);
      },
    });

    // 解析翻译结果并更新段落（只处理尚未更新的段落）
    const translationMap = new Map<string, string>();

    // 优先使用结构化的段落翻译结果
    if (result.paragraphTranslations && result.paragraphTranslations.length > 0) {
      result.paragraphTranslations.forEach((pt) => {
        if (pt.id && pt.translation && !updatedParagraphIds.has(pt.id)) {
          translationMap.set(pt.id, pt.translation);
        }
      });
    } else {
      // 如果没有结构化结果，回退到文本解析
      let translatedText = result.text.trim();

      // 尝试提取 JSON 格式的翻译（如果 AI 返回了 JSON）
      try {
        const jsonMatch = translatedText.match(/\{[\s\S]*"translation"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.translation && typeof parsed.translation === 'string') {
            translatedText = parsed.translation.trim();
          }
        }
      } catch {
        // 不是 JSON 格式，继续使用原始文本
      }

      // 尝试按段落ID解析翻译结果
      // 格式可能是: [ID: xxx] 翻译文本\n\n[ID: yyy] 翻译文本...
      const idPattern = /\[ID:\s*([^\]]+)\]\s*([^[]*?)(?=\[ID:|$)/gs;
      let match;
      while ((match = idPattern.exec(translatedText)) !== null) {
        const paragraphId = match[1]?.trim();
        const translation = match[2]?.trim();
        if (paragraphId && translation) {
          translationMap.set(paragraphId, translation);
        }
      }

      // 如果没有匹配到ID格式，尝试按段落顺序分割
      if (translationMap.size === 0 && translatedText) {
        // 按双换行符分割（段落分隔符），如果段落数匹配则使用
        const translations = translatedText.split(/\n\n+/).filter((t) => t.trim());

        // 只考虑有内容的段落（排除空段落）
        const paragraphsWithContent = paragraphs.filter((p) => p.text && p.text.trim().length > 0);

        // 如果翻译数量与有内容的段落数量匹配，按顺序分配
        if (translations.length === paragraphsWithContent.length) {
          paragraphsWithContent.forEach((para, index) => {
            const translation = translations[index];
            if (translation) {
              translationMap.set(para.id, translation.trim());
            }
          });
        } else if (translations.length > 0) {
          // 如果数量不匹配，尝试按单换行符分割（可能是连续翻译）
          // 或者将整个翻译作为第一个段落的翻译
          // 这里我们采用保守策略：只更新能明确匹配的段落
          const minCount = Math.min(translations.length, paragraphsWithContent.length);
          for (let i = 0; i < minCount; i++) {
            const translation = translations[i];
            const para = paragraphsWithContent[i];
            if (translation && para) {
              translationMap.set(para.id, translation.trim());
            }
          }
        } else {
          // 如果无法分割，将整个翻译文本作为第一个有内容段落的翻译
          const firstPara = paragraphsWithContent[0];
          if (firstPara) {
            translationMap.set(firstPara.id, translatedText);
          }
        }
      }
    }

    // 更新剩余的段落翻译（如果有）和标题翻译
    const hasRemainingParagraphs = translationMap.size > 0;
    const hasTitleTranslation = result.titleTranslation && result.titleTranslation.trim();

    if (hasRemainingParagraphs || hasTitleTranslation) {
      const updatedVolumes = book.value.volumes?.map((volume) => {
        if (!volume.chapters) return volume;

        const updatedChapters = volume.chapters.map((chapter) => {
          if (chapter.id !== selectedChapter.value!.id) return chapter;

          let updatedContent = chapter.content;
          if (hasRemainingParagraphs && chapter.content) {
            updatedContent = chapter.content.map((para) => {
              const translation = translationMap.get(para.id);
              if (!translation) return para;

              // 创建新的翻译对象
              const newTranslation = {
                id: generateShortId(),
                translation: translation,
                aiModelId: selectedModel.id,
              };

              // 添加到翻译列表
              const updatedTranslations = [...(para.translations || []), newTranslation];

              // 只更新翻译相关字段，确保不修改原文（text 字段）
              return {
                id: para.id,
                text: para.text, // 明确保留原文，不修改
                translations: updatedTranslations,
                selectedTranslationId: newTranslation.id,
              };
            });
          }

          // 如果有标题翻译，更新章节标题
          let updatedTitle = chapter.title;
          if (hasTitleTranslation && result.titleTranslation) {
            const newTitleTranslation = {
              id: generateShortId(),
              translation: result.titleTranslation.trim(),
              aiModelId: selectedModel.id,
            };
            updatedTitle = {
              original: chapter.title.original,
              translation: newTitleTranslation,
            };
          }

          return {
            ...chapter,
            title: updatedTitle,
            content: updatedContent,
            lastEdited: new Date(),
          };
        });

        return {
          ...volume,
          chapters: updatedChapters,
        };
      });

      // 更新书籍
      await booksStore.updateBook(book.value.id, {
        volumes: updatedVolumes,
        lastEdited: new Date(),
      });
    }

    // 构建成功消息
    const actions = result.actions || [];
    const totalTranslatedCount = updatedParagraphIds.size + translationMap.size;
    let messageDetail = `已成功翻译 ${totalTranslatedCount} 个段落`;
    if (actions.length > 0) {
      const termActions = actions.filter((a) => a.entity === 'term').length;
      const characterActions = actions.filter((a) => a.entity === 'character').length;
      const actionDetails: string[] = [];
      if (termActions > 0) {
        actionDetails.push(`${termActions} 个术语操作`);
      }
      if (characterActions > 0) {
        actionDetails.push(`${characterActions} 个角色操作`);
      }
      if (actionDetails.length > 0) {
        messageDetail += `，并执行了 ${actionDetails.join('、')}`;
      }
    }

    toast.add({
      severity: 'success',
      summary: '翻译完成',
      detail: messageDetail,
      life: 3000,
    });
  } catch (error) {
    console.error('翻译失败:', error);
    // 检查是否为取消错误（可能是 "请求已取消" 或 "翻译已取消"）
    const isCancelled =
      error instanceof Error &&
      (error.message === '请求已取消' ||
        error.message === '翻译已取消' ||
        error.message.includes('取消') ||
        error.message.includes('cancel') ||
        error.message.includes('aborted'));

    if (!isCancelled) {
      toast.add({
        severity: 'error',
        summary: '翻译失败',
        detail: error instanceof Error ? error.message : '翻译时发生未知错误',
        life: 3000,
      });
    }
  } finally {
    isTranslatingChapter.value = false;
    translationAbortController.value = null;
    // 延迟清除进度信息和正在翻译的段落 ID，让用户看到完成状态
    setTimeout(() => {
      translationProgress.value = {
        current: 0,
        total: 0,
        message: '',
      };
      translatingParagraphIds.value.clear();
    }, 1000);
  }
};

// 取消翻译
const cancelTranslation = () => {
  // 首先取消本地的 abortController（这是最重要的，因为它会真正停止翻译请求）
  if (translationAbortController.value) {
    translationAbortController.value.abort();
    translationAbortController.value = null;
  }

  // 然后取消所有相关的 AI 任务（包括已取消的任务，确保它们的状态正确）
  // 注意：即使任务已经被标记为 cancelled，我们也要确保它们的 abortController 被取消
  const allTasks = aiProcessingStore.activeTasks;
  const translationTasks = allTasks.filter((task) => task.type === 'translation');

  // 取消所有翻译任务（不管状态如何，确保它们的 abortController 被取消）
  for (const task of translationTasks) {
    // 只取消那些还没有完成的任务（包括 thinking、processing、cancelled、error 状态）
    // 注意：即使任务已经被标记为 cancelled，我们也要确保它的 abortController 被取消
    if (task.status !== 'completed') {
      void aiProcessingStore.stopTask(task.id);
    }
  }

  // 更新 UI 状态
  isTranslatingChapter.value = false;
  translationProgress.value = {
    current: 0,
    total: 0,
    message: '',
  };
  translatingParagraphIds.value.clear();
  toast.add({
    severity: 'info',
    summary: '已取消',
    detail: '翻译已取消',
    life: 2000,
  });
};

// 打开编辑角色对话框
const openEditCharacterDialog = (character: CharacterSetting) => {
  editingCharacter.value = character;
  showEditCharacterDialog.value = true;
  // Close popover
  if (characterPopover.value) {
    characterPopover.value.hide();
  }
};

// 保存角色设定
const handleSaveCharacter = async (data: {
  name: string;
  sex?: 'male' | 'female' | 'other' | undefined;
  translation: string;
  description: string;
  aliases: Array<{ name: string; translation: string }>;
}) => {
  if (!book.value || !editingCharacter.value) return;

  if (!data.name) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '角色名称不能为空',
      life: 3000,
    });
    return;
  }

  isSavingCharacter.value = true;

  try {
    const currentCharacterSettings = book.value.characterSettings || [];

    // 检查名称冲突 (排除自己)
    const nameConflict = currentCharacterSettings.find(
      (c) => c.id !== editingCharacter.value!.id && c.name === data.name,
    );

    if (nameConflict) {
      toast.add({
        severity: 'warn',
        summary: '保存失败',
        detail: `角色 "${data.name}" 已存在`,
        life: 3000,
      });
      isSavingCharacter.value = false;
      return;
    }

    await CharacterSettingService.updateCharacterSetting(
      book.value.id,
      editingCharacter.value.id,
      data,
    );

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: `已更新角色 "${data.name}"`,
      life: 3000,
    });

    showEditCharacterDialog.value = false;
    editingCharacter.value = null;
  } catch (error) {
    console.error('保存角色失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '保存角色时发生错误',
      life: 3000,
    });
  } finally {
    isSavingCharacter.value = false;
  }
};

// Add Delete Character Dialog State
const showDeleteCharacterConfirm = ref(false);
const deletingCharacter = ref<CharacterSetting | null>(null);

const openDeleteCharacterConfirm = (character: CharacterSetting) => {
  deletingCharacter.value = character;
  showDeleteCharacterConfirm.value = true;
  if (characterPopover.value) {
    characterPopover.value.hide();
  }
};

const confirmDeleteCharacter = async () => {
  if (!book.value || !deletingCharacter.value) return;

  try {
    await CharacterSettingService.deleteCharacterSetting(book.value.id, deletingCharacter.value.id);

    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: `已删除角色 "${deletingCharacter.value.name}"`,
      life: 3000,
    });

    showDeleteCharacterConfirm.value = false;
    deletingCharacter.value = null;
  } catch (error) {
    console.error('删除角色失败:', error);
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: '删除角色时发生错误',
      life: 3000,
    });
  }
};

// 打开编辑术语对话框
const openEditTermDialog = (term: Terminology) => {
  editingTerm.value = term;
  showEditTermDialog.value = true;
  // Close popover
  if (termPopover.value) {
    termPopover.value.hide();
  }
};

// 保存术语
const handleSaveTerm = async (data: { name: string; translation: string; description: string }) => {
  if (!book.value || !editingTerm.value) return;

  if (!data.name) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '术语名称不能为空',
      life: 3000,
    });
    return;
  }

  isSavingTerm.value = true;

  try {
    const currentTerminologies = book.value.terminologies || [];

    // 检查名称冲突 (排除自己)
    const nameConflict = currentTerminologies.find(
      (t) => t.id !== editingTerm.value!.id && t.name === data.name,
    );

    if (nameConflict) {
      toast.add({
        severity: 'warn',
        summary: '保存失败',
        detail: `术语 "${data.name}" 已存在`,
        life: 3000,
      });
      isSavingTerm.value = false;
      return;
    }

    const updatedTerminologies = currentTerminologies.map((term) => {
      if (term.id === editingTerm.value!.id) {
        const updated: Terminology = {
          ...term,
          name: data.name,
          translation: {
            ...term.translation,
            translation: data.translation,
          },
        };
        if (data.description) {
          updated.description = data.description;
        } else {
          delete updated.description;
        }
        return updated;
      }
      return term;
    });

    await booksStore.updateBook(book.value.id, {
      terminologies: updatedTerminologies,
      lastEdited: new Date(),
    });

    toast.add({
      severity: 'success',
      summary: '保存成功',
      detail: `已更新术语 "${data.name}"`,
      life: 3000,
    });

    showEditTermDialog.value = false;
    editingTerm.value = null;
  } catch (error) {
    console.error('保存术语失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '保存术语时发生错误',
      life: 3000,
    });
  } finally {
    isSavingTerm.value = false;
  }
};

// Add Delete Term Dialog State
const showDeleteTermConfirm = ref(false);
const deletingTerm = ref<Terminology | null>(null);

const openDeleteTermConfirm = (term: Terminology) => {
  deletingTerm.value = term;
  showDeleteTermConfirm.value = true;
  if (termPopover.value) {
    termPopover.value.hide();
  }
};

const confirmDeleteTerm = async () => {
  if (!book.value || !deletingTerm.value) return;

  try {
    const updatedTerminologies = (book.value.terminologies || []).filter(
      (t) => t.id !== deletingTerm.value!.id,
    );

    await booksStore.updateBook(book.value.id, {
      terminologies: updatedTerminologies,
      lastEdited: new Date(),
    });

    toast.add({
      severity: 'success',
      summary: '删除成功',
      detail: `已删除术语 "${deletingTerm.value.name}"`,
      life: 3000,
    });

    showDeleteTermConfirm.value = false;
    deletingTerm.value = null;
  } catch (error) {
    console.error('删除术语失败:', error);
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: '删除术语时发生错误',
      life: 3000,
    });
  }
};

// 添加新卷
const handleAddVolume = async () => {
  if (!book.value || !newVolumeTitle.value.trim()) {
    return;
  }

  const updatedVolumes = ChapterService.addVolume(book.value, newVolumeTitle.value);
  await booksStore.updateBook(book.value.id, {
    volumes: updatedVolumes,
    lastEdited: new Date(),
  });

  toast.add({
    severity: 'success',
    summary: '添加成功',
    detail: `已添加卷 "${newVolumeTitle.value.trim()}"`,
    life: 3000,
  });

  showAddVolumeDialog.value = false;
  newVolumeTitle.value = '';
};

// 添加新章节
const handleAddChapter = async () => {
  if (!book.value || !newChapterTitle.value.trim() || !selectedVolumeId.value) {
    return;
  }

  const updatedVolumes = ChapterService.addChapter(
    book.value,
    selectedVolumeId.value,
    newChapterTitle.value,
  );

  await booksStore.updateBook(book.value.id, {
    volumes: updatedVolumes,
    lastEdited: new Date(),
  });

  // 刷新所有术语和角色的出现次数（新章节可能有内容）
  await TerminologyService.refreshAllTermOccurrences(book.value.id);
  await CharacterSettingService.refreshAllCharacterOccurrences(book.value.id);

  toast.add({
    severity: 'success',
    summary: '添加成功',
    detail: `已添加章节 "${newChapterTitle.value.trim()}"`,
    life: 3000,
  });

  showAddChapterDialog.value = false;
  newChapterTitle.value = '';
  selectedVolumeId.value = null;
};

// 打开添加章节对话框
const openAddChapterDialog = () => {
  if (!book.value || !book.value.volumes || book.value.volumes.length === 0) {
    toast.add({
      severity: 'warn',
      summary: '无法添加章节',
      detail: '请先添加至少一个卷',
      life: 3000,
    });
    return;
  }
  showAddChapterDialog.value = true;
};

// 打开编辑卷对话框
const openEditVolumeDialog = (volume: Volume) => {
  editingVolumeId.value = volume.id;
  // 兼容旧数据格式
  if (typeof volume.title === 'string') {
    editingVolumeTitle.value = volume.title;
    editingVolumeTranslation.value = '';
  } else {
    editingVolumeTitle.value = volume.title?.original || '';
    editingVolumeTranslation.value = volume.title?.translation?.translation || '';
  }
  showEditVolumeDialog.value = true;
};

// 打开编辑章节对话框
const openEditChapterDialog = (chapter: Chapter) => {
  if (!book.value) return;

  // 找到章节所在的卷
  const sourceVolume = book.value.volumes?.find((volume) =>
    volume.chapters?.some((c) => c.id === chapter.id),
  );

  editingChapterId.value = chapter.id;
  // 兼容旧数据格式
  if (typeof chapter.title === 'string') {
    editingChapterTitle.value = chapter.title;
    editingChapterTranslation.value = '';
  } else {
    editingChapterTitle.value = chapter.title?.original || '';
    editingChapterTranslation.value = chapter.title?.translation?.translation || '';
  }
  editingChapterSourceVolumeId.value = sourceVolume?.id || null;
  editingChapterTargetVolumeId.value = sourceVolume?.id || null;
  showEditChapterDialog.value = true;
};

// 保存编辑的卷
const handleEditVolume = async () => {
  if (!book.value || !editingVolumeId.value || !editingVolumeTitle.value.trim()) {
    return;
  }

  // 获取当前卷以保留翻译 ID
  const currentVolume = book.value.volumes?.find((v) => v.id === editingVolumeId.value);

  // 兼容旧数据格式
  let translationId = '';
  let aiModelId = '';

  if (currentVolume) {
    if (typeof currentVolume.title === 'string') {
      // 旧数据格式，创建新的翻译 ID
      translationId = generateShortId();
    } else {
      translationId = currentVolume.title.translation?.id || generateShortId();
      aiModelId = currentVolume.title.translation?.aiModelId || '';
    }
  } else {
    translationId = generateShortId();
  }

  const updatedVolumes = ChapterService.updateVolume(book.value, editingVolumeId.value, {
    title: {
      original: editingVolumeTitle.value.trim(),
      translation: {
        id: translationId,
        translation: editingVolumeTranslation.value.trim(),
        aiModelId: aiModelId,
      },
    },
  });

  await booksStore.updateBook(book.value.id, {
    volumes: updatedVolumes,
    lastEdited: new Date(),
  });

  toast.add({
    severity: 'success',
    summary: '更新成功',
    detail: `已更新卷标题`,
    life: 3000,
  });

  showEditVolumeDialog.value = false;
  editingVolumeId.value = null;
  editingVolumeTitle.value = '';
  editingVolumeTranslation.value = '';
};

// 保存编辑的章节
const handleEditChapter = async () => {
  if (
    !book.value ||
    !editingChapterId.value ||
    !editingChapterTitle.value.trim() ||
    !editingChapterTargetVolumeId.value
  ) {
    return;
  }

  // 获取当前章节以保留翻译 ID
  let currentChapter: Chapter | null = null;
  for (const volume of book.value.volumes || []) {
    const chapter = volume.chapters?.find((c) => c.id === editingChapterId.value);
    if (chapter) {
      currentChapter = chapter;
      break;
    }
  }

  // 兼容旧数据格式
  let translationId = '';
  let aiModelId = '';

  if (currentChapter) {
    if (typeof currentChapter.title === 'string') {
      // 旧数据格式，创建新的翻译 ID
      translationId = generateShortId();
    } else {
      translationId = currentChapter.title.translation?.id || generateShortId();
      aiModelId = currentChapter.title.translation?.aiModelId || '';
    }
  } else {
    translationId = generateShortId();
  }

  const updatedVolumes = ChapterService.updateChapter(
    book.value,
    editingChapterId.value,
    {
      title: {
        original: editingChapterTitle.value.trim(),
        translation: {
          id: translationId,
          translation: editingChapterTranslation.value.trim(),
          aiModelId: aiModelId,
        },
      },
    },
    editingChapterTargetVolumeId.value,
  );

  await booksStore.updateBook(book.value.id, {
    volumes: updatedVolumes,
    lastEdited: new Date(),
  });

  const moveMessage =
    editingChapterSourceVolumeId.value !== editingChapterTargetVolumeId.value ? '并移动到新卷' : '';

  toast.add({
    severity: 'success',
    summary: '更新成功',
    detail: `已更新章节标题${moveMessage}`,
    life: 3000,
  });

  showEditChapterDialog.value = false;
  editingChapterId.value = null;
  editingChapterTitle.value = '';
  editingChapterTranslation.value = '';
  editingChapterSourceVolumeId.value = null;
  editingChapterTargetVolumeId.value = null;
};

// 打开删除卷确认对话框
const openDeleteVolumeConfirm = (volume: Volume) => {
  deletingVolumeId.value = volume.id;
  deletingVolumeTitle.value = getVolumeDisplayTitle(volume);
  showDeleteVolumeConfirm.value = true;
};

// 打开删除章节确认对话框
const openDeleteChapterConfirm = (chapter: Chapter) => {
  deletingChapterId.value = chapter.id;
  deletingChapterTitle.value = getChapterDisplayTitle(chapter);
  showDeleteChapterConfirm.value = true;
};

// 确认删除卷
const handleDeleteVolume = async () => {
  if (!book.value || !deletingVolumeId.value) {
    return;
  }

  const updatedVolumes = ChapterService.deleteVolume(book.value, deletingVolumeId.value);

  await booksStore.updateBook(book.value.id, {
    volumes: updatedVolumes,
    lastEdited: new Date(),
  });

  toast.add({
    severity: 'success',
    summary: '删除成功',
    detail: `已删除卷 "${deletingVolumeTitle.value}"`,
    life: 3000,
  });

  showDeleteVolumeConfirm.value = false;
  deletingVolumeId.value = null;
  deletingVolumeTitle.value = '';
};

// 确认删除章节
const handleDeleteChapter = async () => {
  if (!book.value || !deletingChapterId.value) {
    return;
  }

  const updatedVolumes = ChapterService.deleteChapter(book.value, deletingChapterId.value);

  await booksStore.updateBook(book.value.id, {
    volumes: updatedVolumes,
    lastEdited: new Date(),
  });

  // 刷新所有术语和角色的出现次数（删除章节后需要更新）
  await TerminologyService.refreshAllTermOccurrences(book.value.id);
  await CharacterSettingService.refreshAllCharacterOccurrences(book.value.id);

  toast.add({
    severity: 'success',
    summary: '删除成功',
    detail: `已删除章节 "${deletingChapterTitle.value}"`,
    life: 3000,
  });

  showDeleteChapterConfirm.value = false;
  deletingChapterId.value = null;
  deletingChapterTitle.value = '';
};

// 保存书籍（编辑）
const handleBookSave = async (formData: Partial<Novel>) => {
  if (!book.value) return;

  const updates: Partial<Novel> = {
    title: formData.title!,
    lastEdited: new Date(),
  };
  if (formData.alternateTitles && formData.alternateTitles.length > 0) {
    updates.alternateTitles = formData.alternateTitles;
  }
  if (formData.author?.trim()) {
    updates.author = formData.author.trim();
  }
  if (formData.description?.trim()) {
    updates.description = formData.description.trim();
  }
  if (formData.tags && formData.tags.length > 0) {
    updates.tags = formData.tags;
  }
  if (formData.webUrl && formData.webUrl.length > 0) {
    updates.webUrl = formData.webUrl;
  }
  // 处理封面：如果提供了封面就更新，如果为 null 就删除封面
  if (formData.cover !== undefined) {
    updates.cover = formData.cover;
  }
  // 处理 volumes：如果提供了 volumes 就更新
  if (formData.volumes !== undefined) {
    updates.volumes = formData.volumes;
  }
  await booksStore.updateBook(book.value.id, updates);
  showBookDialog.value = false;
  const bookTitle = updates.title || book.value.title;
  toast.add({
    severity: 'success',
    summary: '更新成功',
    detail: `已成功更新书籍 "${bookTitle}"`,
    life: 3000,
  });
};

// 拖拽处理函数
const handleDragStart = (event: DragEvent, chapter: Chapter, volumeId: string, index: number) => {
  if (!event.dataTransfer) return;
  draggedChapter.value = { chapter, sourceVolumeId: volumeId, sourceIndex: index };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', chapter.id);
  if (event.target instanceof HTMLElement) {
    event.target.style.opacity = '0.5';
  }
};

const handleDragEnd = (event: DragEvent) => {
  draggedChapter.value = null;
  dragOverVolumeId.value = null;
  dragOverIndex.value = null;
  if (event.target instanceof HTMLElement) {
    event.target.style.opacity = '1';
  }
};

const handleDragOver = (event: DragEvent, volumeId: string, index?: number) => {
  event.preventDefault();
  if (!event.dataTransfer) return;
  event.dataTransfer.dropEffect = 'move';
  dragOverVolumeId.value = volumeId;
  if (index !== undefined) {
    dragOverIndex.value = index;
  }
};

const handleDrop = async (event: DragEvent, targetVolumeId: string, targetIndex?: number) => {
  event.preventDefault();
  if (!draggedChapter.value || !book.value) return;

  const { chapter, sourceVolumeId } = draggedChapter.value;

  // 检查是否真的需要移动
  // 如果只是在同一个位置放下，不需要操作
  // 这里简单处理，只要 drop 就调用 service，service 会处理
  // 但是我们可以先做个简单的检查：如果源和目标相同且 index 没有变（比较难判断 index，因为 DOM 列表可能和数据不完全对应）
  // 还是交给 service 比较稳妥

  const updatedVolumes = ChapterService.moveChapter(
    book.value,
    chapter.id,
    targetVolumeId,
    targetIndex,
  );

  // 更新书籍
  await booksStore.updateBook(book.value.id, {
    volumes: updatedVolumes,
    lastEdited: new Date(),
  });

  toast.add({
    severity: 'success',
    summary: '移动成功',
    detail: `已将章节 "${getChapterDisplayTitle(chapter)}" ${sourceVolumeId === targetVolumeId ? '重新排序' : '移动到新卷'}`,
    life: 3000,
  });

  // 重置拖拽状态
  draggedChapter.value = null;
  dragOverVolumeId.value = null;
  dragOverIndex.value = null;
};

const handleDragLeave = () => {
  // 延迟清除，避免在子元素间移动时闪烁
  setTimeout(() => {
    if (!draggedChapter.value) {
      dragOverVolumeId.value = null;
      dragOverIndex.value = null;
    }
  }, 50);
};
</script>

<template>
  <div class="book-details-layout">
    <!-- 左侧卷/章节面板 -->
    <aside class="book-sidebar">
      <div class="sidebar-content">
        <!-- 书籍封面和标题 -->
        <div v-if="book" class="book-header">
          <div class="book-header-content" @click="showBookDialog = true">
            <i class="pi pi-info-circle book-edit-icon"></i>
            <div class="book-cover-wrapper">
              <img
                :src="book ? getCoverUrl(book) : ''"
                :alt="book?.title || ''"
                class="book-cover"
                @error="
                  (e) => {
                    const target = e.target as HTMLImageElement;
                    if (book) {
                      target.src = getCoverUrl(book);
                    }
                  }
                "
              />
            </div>
            <div class="book-info">
              <h3 class="book-title">{{ book.title }}</h3>
              <div v-if="stats" class="book-stats">
                <div class="stat-item stat-item-volume">
                  <i class="pi pi-file stat-icon"></i>
                  <span class="stat-value">{{ stats.volumeCount }}</span>
                  <span class="stat-label">卷</span>
                </div>
                <span class="stat-separator">|</span>
                <div class="stat-item stat-item-chapter">
                  <i class="pi pi-list stat-icon"></i>
                  <span class="stat-value">{{ stats.chapterCount }}</span>
                  <span class="stat-label">章</span>
                </div>
                <span class="stat-separator">|</span>
                <div class="stat-item stat-item-wordcount">
                  <i class="pi pi-align-left stat-icon"></i>
                  <span class="stat-value">{{ formatWordCount(stats.wordCount) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="book-separator"></div>
        </div>

        <!-- 设置菜单 -->
        <div class="settings-menu-wrapper">
          <div class="settings-menu-items">
            <button
              class="settings-menu-item"
              :class="{ 'settings-menu-item-selected': selectedSettingMenu === 'terms' }"
              @click="navigateToTermsSetting"
            >
              <i class="pi pi-bookmark settings-menu-icon"></i>
              <span class="settings-menu-label">术语设置</span>
            </button>
            <button
              class="settings-menu-item"
              :class="{ 'settings-menu-item-selected': selectedSettingMenu === 'characters' }"
              @click="navigateToCharactersSetting"
            >
              <i class="pi pi-users settings-menu-icon"></i>
              <span class="settings-menu-label">角色设置</span>
            </button>
            <button class="settings-menu-item" @click="openScraperDialog">
              <i class="pi pi-download settings-menu-icon"></i>
              <span class="settings-menu-label">检查更新</span>
            </button>
          </div>
          <div class="settings-menu-separator"></div>
        </div>

        <!-- 目录标题和操作按钮 -->
        <div class="sidebar-title-wrapper">
          <h2 class="sidebar-title">目录</h2>
          <div class="sidebar-actions">
            <Button
              icon="pi pi-plus"
              label="新卷"
              class="p-button-text p-button-sm"
              size="small"
              title="添加新卷"
              @click="showAddVolumeDialog = true"
            />
            <Button
              icon="pi pi-plus-circle"
              label="新章节"
              class="p-button-text p-button-sm"
              size="small"
              title="添加新章节"
              @click="openAddChapterDialog"
            />
          </div>
        </div>

        <!-- 卷和章节列表 -->
        <div class="volumes-container">
          <DataView v-if="volumes.length > 0" :value="volumes" data-key="id" layout="list">
            <template #list="slotProps">
              <div class="volumes-list">
                <div v-for="volume in slotProps.items" :key="volume.id" class="volume-item">
                  <div class="volume-header">
                    <div class="volume-header-content" @click="toggleVolume(volume.id)">
                      <i
                        :class="[
                          'pi volume-toggle-icon',
                          isVolumeExpanded(volume.id) ? 'pi-chevron-down' : 'pi-chevron-right',
                        ]"
                      ></i>
                      <i class="pi pi-book volume-icon"></i>
                      <span class="volume-title">{{ getVolumeDisplayTitle(volume) }}</span>
                      <span
                        v-if="volume.chapters && volume.chapters.length > 0"
                        class="volume-chapter-count"
                      >
                        ({{ volume.chapters.length }} 章)
                      </span>
                    </div>
                    <div class="volume-actions" @click.stop>
                      <Button
                        icon="pi pi-pencil"
                        class="p-button-text p-button-sm p-button-rounded action-button"
                        size="small"
                        title="编辑"
                        @click="openEditVolumeDialog(volume)"
                      />
                      <Button
                        icon="pi pi-trash"
                        class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
                        size="small"
                        title="删除"
                        @click="openDeleteVolumeConfirm(volume)"
                      />
                    </div>
                  </div>
                  <Transition name="slide-down">
                    <div
                      v-if="
                        volume.chapters && volume.chapters.length > 0 && isVolumeExpanded(volume.id)
                      "
                      class="chapters-list"
                      @dragover.prevent="handleDragOver($event, volume.id)"
                      @drop="handleDrop($event, volume.id)"
                      @dragleave="handleDragLeave"
                      :class="{
                        'drag-over': dragOverVolumeId === volume.id && dragOverIndex === null,
                      }"
                    >
                      <div
                        v-for="(chapter, index) in volume.chapters"
                        :key="chapter.id"
                        :class="[
                          'chapter-item',
                          { 'chapter-item-selected': selectedChapterId === chapter.id },
                          {
                            'drag-over': dragOverVolumeId === volume.id && dragOverIndex === index,
                          },
                          { dragging: draggedChapter?.chapter.id === chapter.id },
                        ]"
                        draggable="true"
                        @dragstart="handleDragStart($event, chapter, volume.id, index)"
                        @dragend="handleDragEnd($event)"
                        @dragover.prevent="handleDragOver($event, volume.id, index)"
                        @drop="handleDrop($event, volume.id, index)"
                      >
                        <div class="chapter-content" @click="navigateToChapter(chapter)">
                          <i class="pi pi-bars drag-handle"></i>
                          <i class="pi pi-file chapter-icon"></i>
                          <span class="chapter-title">{{ getChapterDisplayTitle(chapter) }}</span>
                        </div>
                        <div class="chapter-actions" @click.stop>
                          <Button
                            icon="pi pi-pencil"
                            class="p-button-text p-button-sm p-button-rounded action-button"
                            size="small"
                            title="编辑"
                            @click="openEditChapterDialog(chapter)"
                          />
                          <Button
                            icon="pi pi-trash"
                            class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
                            size="small"
                            title="删除"
                            @click="openDeleteChapterConfirm(chapter)"
                          />
                        </div>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </template>
            <template #empty>
              <div class="empty-state">
                <p class="text-moon/60 text-sm">暂无卷和章节</p>
              </div>
            </template>
          </DataView>
          <div v-else class="empty-state">
            <p class="text-moon/60 text-sm">暂无卷和章节</p>
          </div>
        </div>

        <!-- 返回链接 -->
        <div class="back-link-wrapper">
          <button class="back-link" @click="() => void router.push('/books')">
            <i class="pi pi-arrow-left"></i>
            <span>返回书籍列表</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- 添加卷对话框 -->
    <Dialog
      v-model:visible="showAddVolumeDialog"
      modal
      header="添加新卷"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="volume-title" class="block text-sm font-medium text-moon/90">卷标题</label>
          <InputText
            id="volume-title"
            v-model="newVolumeTitle"
            placeholder="输入卷标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleAddVolume"
          />
        </div>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showAddVolumeDialog = false" />
        <Button label="添加" :disabled="!newVolumeTitle.trim()" @click="handleAddVolume" />
      </template>
    </Dialog>

    <!-- 添加章节对话框 -->
    <Dialog
      v-model:visible="showAddChapterDialog"
      modal
      header="添加新章节"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="volume-select" class="block text-sm font-medium text-moon/90">选择卷</label>
          <Select
            id="volume-select"
            v-model="selectedVolumeId"
            :options="volumeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="请选择卷"
            class="w-full"
          />
        </div>
        <div class="space-y-2">
          <label for="chapter-title" class="block text-sm font-medium text-moon/90">章节标题</label>
          <InputText
            id="chapter-title"
            v-model="newChapterTitle"
            placeholder="输入章节标题..."
            class="w-full"
            autofocus
            @keyup.enter="handleAddChapter"
          />
        </div>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showAddChapterDialog = false" />
        <Button
          label="添加"
          :disabled="!newChapterTitle.trim() || !selectedVolumeId"
          @click="handleAddChapter"
        />
      </template>
    </Dialog>

    <!-- 编辑卷对话框 -->
    <Dialog
      v-model:visible="showEditVolumeDialog"
      modal
      header="编辑卷标题"
      :style="{ width: '30rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="edit-volume-title" class="block text-sm font-medium text-moon/90"
            >卷标题（原文）*</label
          >
          <TranslatableInput
            id="edit-volume-title"
            v-model="editingVolumeTitle"
            placeholder="输入卷标题..."
            type="input"
            :apply-translation-to-input="false"
            @translation-applied="
              (value: string) => {
                editingVolumeTranslation = value;
              }
            "
            @keyup.enter="handleEditVolume"
          />
        </div>
        <div class="space-y-2">
          <label for="edit-volume-translation" class="block text-sm font-medium text-moon/90"
            >翻译</label
          >
          <InputText
            id="edit-volume-translation"
            v-model="editingVolumeTranslation"
            placeholder="输入翻译（可选）"
            class="w-full"
            @keyup.enter="handleEditVolume"
          />
        </div>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showEditVolumeDialog = false" />
        <Button label="保存" :disabled="!editingVolumeTitle.trim()" @click="handleEditVolume" />
      </template>
    </Dialog>

    <!-- 编辑章节对话框 -->
    <Dialog
      v-model:visible="showEditChapterDialog"
      modal
      header="编辑章节"
      :style="{ width: '30rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <label for="edit-chapter-title" class="block text-sm font-medium text-moon/90"
            >章节标题（原文）*</label
          >
          <TranslatableInput
            id="edit-chapter-title"
            v-model="editingChapterTitle"
            placeholder="输入章节标题..."
            type="input"
            :apply-translation-to-input="false"
            @translation-applied="
              (value: string) => {
                editingChapterTranslation = value;
              }
            "
            @keyup.enter="handleEditChapter"
          />
        </div>
        <div class="space-y-2">
          <label for="edit-chapter-translation" class="block text-sm font-medium text-moon/90"
            >翻译</label
          >
          <InputText
            id="edit-chapter-translation"
            v-model="editingChapterTranslation"
            placeholder="输入翻译（可选）"
            class="w-full"
            @keyup.enter="handleEditChapter"
          />
        </div>
        <div class="space-y-2" v-if="volumes.length > 0">
          <label for="edit-chapter-volume" class="block text-sm font-medium text-moon/90"
            >所属卷</label
          >
          <Select
            id="edit-chapter-volume"
            v-model="editingChapterTargetVolumeId"
            :options="volumeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="选择卷"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showEditChapterDialog = false" />
        <Button
          label="保存"
          :disabled="!editingChapterTitle.trim() || !editingChapterTargetVolumeId"
          @click="handleEditChapter"
        />
      </template>
    </Dialog>

    <!-- 删除卷确认对话框 -->
    <Dialog
      v-model:visible="showDeleteVolumeConfirm"
      modal
      header="确认删除"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除卷 <strong>"{{ deletingVolumeTitle }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作将同时删除该卷下的所有章节，且无法撤销。</p>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showDeleteVolumeConfirm = false" />
        <Button label="删除" class="p-button-danger" @click="handleDeleteVolume" />
      </template>
    </Dialog>

    <!-- 删除章节确认对话框 -->
    <Dialog
      v-model:visible="showDeleteChapterConfirm"
      modal
      header="确认删除"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除章节 <strong>"{{ deletingChapterTitle }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showDeleteChapterConfirm = false" />
        <Button label="删除" class="p-button-danger" @click="handleDeleteChapter" />
      </template>
    </Dialog>

    <!-- 书籍编辑对话框 -->
    <BookDialog
      v-model:visible="showBookDialog"
      mode="edit"
      :book="book || null"
      @save="handleBookSave"
      @cancel="showBookDialog = false"
    />

    <!-- 从在线获取更新对话框 -->
    <NovelScraperDialog
      v-model:visible="showScraperDialog"
      :current-book="book || null"
      :initial-url="book?.webUrl?.[0] || ''"
      :show-novel-info="false"
      initialFilter="unimported"
      @apply="handleScraperUpdate"
    />

    <!-- 术语列表 Popover -->
    <Popover ref="termPopover" style="width: 24rem; max-width: 90vw">
      <div class="flex flex-col max-h-[60vh] overflow-hidden">
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <DataView :value="usedTerms" data-key="id" layout="list" class="term-popover-dataview">
            <template #header>
              <div class="p-3">
                <h4 class="font-medium text-moon-100">本章使用的术语</h4>
                <p class="text-xs text-moon/60 mt-1">共 {{ usedTermCount }} 个</p>
              </div>
            </template>
            <template #list="slotProps">
              <div class="flex flex-col gap-2 p-2">
                <div
                  v-for="term in slotProps.items"
                  :key="term.id"
                  class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div class="flex justify-between items-start gap-2 min-w-0">
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div class="font-medium text-sm text-moon-90 break-words">
                        {{ term.name }}
                      </div>
                      <div class="text-xs text-primary-400 mt-0.5 break-words">
                        {{ term.translation.translation }}
                      </div>
                      <div
                        v-if="term.description"
                        class="text-xs text-moon/50 mt-1 line-clamp-2 break-words"
                      >
                        {{ term.description }}
                      </div>
                    </div>
                    <div class="flex gap-1 flex-shrink-0">
                      <Button
                        icon="pi pi-pencil"
                        class="p-button-text p-button-sm !p-1 !w-7 !h-7"
                        @click="openEditTermDialog(term)"
                      />
                      <Button
                        icon="pi pi-trash"
                        class="p-button-text p-button-danger p-button-sm !p-1 !w-7 !h-7"
                        @click="openDeleteTermConfirm(term)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <template #empty>
              <div class="text-center py-8 text-moon/50 text-sm">本章暂无术语</div>
            </template>
          </DataView>
        </div>
      </div>
    </Popover>

    <!-- 角色设定列表 Popover -->
    <Popover ref="characterPopover" style="width: 24rem; max-width: 90vw">
      <div class="flex flex-col max-h-[60vh] overflow-hidden">
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <DataView
            :value="usedCharacters"
            data-key="id"
            layout="list"
            class="character-popover-dataview"
          >
            <template #header>
              <div class="p-3">
                <h4 class="font-medium text-moon-100">本章使用的角色设定</h4>
                <p class="text-xs text-moon/60 mt-1">共 {{ usedCharacterCount }} 个</p>
              </div>
            </template>
            <template #list="slotProps">
              <div class="flex flex-col gap-2 p-2">
                <div
                  v-for="character in slotProps.items"
                  :key="character.id"
                  class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div class="flex justify-between items-start gap-2 min-w-0">
                    <div class="min-w-0 flex-1 overflow-hidden">
                      <div class="flex items-center gap-2">
                        <div class="font-medium text-sm text-moon-90 break-words">
                          {{ character.name }}
                        </div>
                        <span
                          v-if="character.sex"
                          class="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary-400"
                        >
                          {{
                            character.sex === 'male'
                              ? '男'
                              : character.sex === 'female'
                                ? '女'
                                : '其他'
                          }}
                        </span>
                      </div>
                      <div class="text-xs text-primary-400 mt-0.5 break-words">
                        {{ character.translation.translation }}
                      </div>
                      <div
                        v-if="character.description"
                        class="text-xs text-moon/50 mt-1 line-clamp-2 break-words"
                      >
                        {{ character.description }}
                      </div>
                      <div
                        v-if="character.aliases && character.aliases.length > 0"
                        class="text-xs text-moon/60 mt-1"
                      >
                        <span class="text-moon/50">别名：</span>
                        <span class="break-words">
                          {{ character.aliases.map((a: { name: string }) => a.name).join('、') }}
                        </span>
                      </div>
                    </div>
                    <div class="flex gap-1 flex-shrink-0">
                      <Button
                        icon="pi pi-pencil"
                        class="p-button-text p-button-sm !p-1 !w-7 !h-7"
                        @click="openEditCharacterDialog(character)"
                      />
                      <Button
                        icon="pi pi-trash"
                        class="p-button-text p-button-danger p-button-sm !p-1 !w-7 !h-7"
                        @click="openDeleteCharacterConfirm(character)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <template #empty>
              <div class="text-center py-8 text-moon/50 text-sm">本章暂无角色设定</div>
            </template>
          </DataView>
        </div>
      </div>
    </Popover>

    <!-- 编辑术语对话框 -->
    <TermEditDialog
      v-model:visible="showEditTermDialog"
      mode="edit"
      :term="editingTerm"
      :loading="isSavingTerm"
      @save="handleSaveTerm"
    />

    <!-- 删除术语确认对话框 -->
    <Dialog
      v-model:visible="showDeleteTermConfirm"
      modal
      header="确认删除术语"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除术语 <strong>"{{ deletingTerm?.name }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showDeleteTermConfirm = false" />
        <Button label="删除" class="p-button-danger" @click="confirmDeleteTerm" />
      </template>
    </Dialog>

    <!-- 编辑角色对话框 -->
    <CharacterEditDialog
      v-model:visible="showEditCharacterDialog"
      :character="editingCharacter"
      :loading="isSavingCharacter"
      @save="handleSaveCharacter"
    />

    <!-- 删除角色确认对话框 -->
    <Dialog
      v-model:visible="showDeleteCharacterConfirm"
      modal
      header="确认删除角色"
      :style="{ width: '25rem' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          确定要删除角色 <strong>"{{ deletingCharacter?.name }}"</strong> 吗？
        </p>
        <p class="text-sm text-moon/70">此操作无法撤销。</p>
      </div>
      <template #footer>
        <Button label="取消" class="p-button-text" @click="showDeleteCharacterConfirm = false" />
        <Button label="删除" class="p-button-danger" @click="confirmDeleteCharacter" />
      </template>
    </Dialog>

    <!-- 主内容区域 -->
    <div class="book-main-content" :class="{ 'overflow-hidden': !!selectedSettingMenu }">
      <!-- 章节阅读工具栏 -->
      <div v-if="selectedChapter && !selectedSettingMenu" class="chapter-toolbar">
        <div class="toolbar-content">
          <div class="toolbar-left">
            <span class="toolbar-chapter-title">{{ getChapterDisplayTitle(selectedChapter) }}</span>
          </div>
          <div class="toolbar-separator"></div>
          <div class="toolbar-center">
            <div class="toolbar-edit-mode-buttons">
              <Button
                v-for="option in editModeOptions"
                :key="option.value"
                :icon="option.icon"
                :title="option.title"
                :class="[
                  'p-button-text p-button-sm p-button-rounded',
                  { 'p-highlight': editMode === option.value },
                ]"
                @click="editMode = option.value"
              />
            </div>
          </div>
          <div class="toolbar-separator"></div>
          <div class="toolbar-right">
            <div class="toolbar-button-with-badge">
              <Button
                icon="pi pi-bookmark"
                class="p-button-text p-button-rounded p-button-sm"
                size="small"
                :title="`本章共使用了 ${usedTermCount} 个术语`"
                @click="toggleTermPopover"
              />
              <Badge
                v-if="usedTermCount > 0"
                :value="usedTermCount > 99 ? '99+' : usedTermCount"
                severity="info"
                class="toolbar-badge"
              />
            </div>
            <div class="toolbar-button-with-badge">
              <Button
                icon="pi pi-user"
                class="p-button-text p-button-rounded p-button-sm"
                size="small"
                :title="`本章共使用了 ${usedCharacterCount} 个角色设定`"
                @click="toggleCharacterPopover"
              />
              <Badge
                v-if="usedCharacterCount > 0"
                :value="usedCharacterCount > 99 ? '99+' : usedCharacterCount"
                severity="info"
                class="toolbar-badge"
              />
            </div>
            <div class="toolbar-separator"></div>
            <Button
              label="翻译本章"
              icon="pi pi-language"
              class="p-button-sm"
              size="small"
              :loading="isTranslatingChapter"
              :disabled="isTranslatingChapter || !selectedChapterParagraphs.length"
              @click="translateAllParagraphs"
            />
          </div>
        </div>
      </div>

      <div class="scrollable-content">
        <div
          class="page-container"
          :class="{ '!h-full !overflow-hidden !min-h-0 flex flex-col': !!selectedSettingMenu }"
        >
          <!-- 术语设置面板 -->
          <TerminologyPanel
            v-if="selectedSettingMenu === 'terms'"
            :book="book || null"
            class="flex-1 min-h-0"
          />

          <!-- 角色设置面板 -->
          <CharacterSettingPanel
            v-else-if="selectedSettingMenu === 'characters'"
            :book="book || null"
            class="flex-1 min-h-0"
          />

          <!-- 章节内容 -->
          <div v-else-if="selectedChapter" class="chapter-content-container">
            <!-- 原始文本编辑模式 -->
            <div v-if="editMode === 'original'" class="original-text-edit-container">
              <div class="space-y-4">
                <div class="space-y-2">
                  <label class="block text-sm font-medium text-moon/90">原始文本</label>
                  <Textarea
                    v-model="originalTextEditValue"
                    :auto-resize="true"
                    rows="20"
                    class="w-full original-text-textarea"
                    placeholder="输入原始文本..."
                  />
                </div>
                <div class="flex gap-2 justify-end">
                  <Button label="取消" class="p-button-text" @click="cancelOriginalTextEdit" />
                  <Button label="保存" @click="saveOriginalTextEdit" />
                </div>
              </div>
            </div>

            <!-- 翻译预览模式 -->
            <div v-else-if="editMode === 'preview'" class="translation-preview-container">
              <!-- 章节标题 -->
              <div v-if="selectedChapter" class="preview-chapter-header">
                <h1 class="preview-chapter-title">
                  {{ getChapterDisplayTitle(selectedChapter) }}
                </h1>
                <!-- 翻译统计 -->
                <div v-if="selectedChapterParagraphs.length > 0" class="preview-chapter-stats">
                  <div class="preview-stat-item">
                    <i class="pi pi-align-left preview-stat-icon"></i>
                    <span class="preview-stat-value">{{
                      formatWordCount(translatedCharCount)
                    }}</span>
                    <span class="preview-stat-label">已翻译</span>
                  </div>
                </div>
              </div>
              <div v-if="selectedChapterParagraphs.length > 0" class="paragraphs-container">
                <div
                  v-for="paragraph in selectedChapterParagraphs"
                  :key="paragraph.id"
                  class="translation-preview-paragraph"
                  :class="{
                    'untranslated-paragraph':
                      !getParagraphTranslationText(paragraph) && paragraph.text.trim(),
                  }"
                >
                  <template v-if="getParagraphTranslationText(paragraph)">
                    <p class="translation-text">
                      {{ getParagraphTranslationText(paragraph) }}
                    </p>
                  </template>
                  <template v-else-if="paragraph.text.trim()">
                    <div class="untranslated-content">
                      <Badge value="未翻译" severity="warning" class="untranslated-badge" />
                      <p class="original-text">
                        {{ paragraph.text }}
                      </p>
                    </div>
                  </template>
                </div>
              </div>
              <div v-else class="empty-chapter-content">
                <i class="pi pi-file empty-icon"></i>
                <p class="empty-text">该章节暂无内容</p>
                <p class="empty-hint text-moon/60 text-sm">章节内容将在这里显示</p>
              </div>
            </div>

            <!-- 翻译模式（默认） -->
            <template v-else>
              <!-- 章节标题 -->
              <div class="chapter-header">
                <div class="flex items-center gap-2">
                  <h1 class="chapter-title flex-1">
                    {{ getChapterDisplayTitle(selectedChapter) }}
                  </h1>
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm p-button-rounded"
                    size="small"
                    title="编辑章节标题"
                    @click="openEditChapterDialog(selectedChapter)"
                  />
                </div>
                <div v-if="selectedChapterStats" class="chapter-stats">
                  <div class="chapter-stat-item">
                    <i class="pi pi-list chapter-stat-icon"></i>
                    <span class="chapter-stat-value">{{
                      selectedChapterStats.paragraphCount
                    }}</span>
                    <span class="chapter-stat-label">段落</span>
                  </div>
                  <span class="chapter-stat-separator">|</span>
                  <div class="chapter-stat-item">
                    <i class="pi pi-align-left chapter-stat-icon"></i>
                    <span class="chapter-stat-value">{{
                      formatWordCount(selectedChapterStats.charCount)
                    }}</span>
                  </div>
                </div>
                <div v-if="selectedChapter.lastUpdated" class="chapter-meta">
                  <i class="pi pi-clock chapter-meta-icon"></i>
                  <span class="chapter-meta-text"
                    >发布于:
                    {{ new Date(selectedChapter.lastUpdated).toLocaleString('zh-CN') }}</span
                  >
                </div>
                <div v-if="selectedChapter.lastEdited" class="chapter-meta">
                  <i class="pi pi-clock chapter-meta-icon"></i>
                  <span class="chapter-meta-text"
                    >本地最后编辑:
                    {{ new Date(selectedChapter.lastEdited).toLocaleString('zh-CN') }}</span
                  >
                </div>
                <a
                  v-if="selectedChapter.webUrl"
                  :href="selectedChapter.webUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="chapter-web-url"
                >
                  <i class="pi pi-external-link"></i>
                  <span>查看原文</span>
                </a>
              </div>

              <!-- 章节段落列表 -->
              <div v-if="selectedChapterParagraphs.length > 0" class="paragraphs-container">
                <div
                  v-for="(paragraph, index) in selectedChapterParagraphs"
                  :key="paragraph.id"
                  class="paragraph-with-line-number"
                >
                  <span class="line-number">{{ index + 1 }}</span>
                  <ParagraphCard
                    :paragraph="paragraph"
                    :terminologies="book?.terminologies || []"
                    :character-settings="book?.characterSettings || []"
                    :is-translating="translatingParagraphIds.has(paragraph.id)"
                  />
                </div>
              </div>

              <!-- 空状态 -->
              <div v-else class="empty-chapter-content">
                <i class="pi pi-file empty-icon"></i>
                <p class="empty-text">该章节暂无内容</p>
                <p class="empty-hint text-moon/60 text-sm">章节内容将在这里显示</p>
              </div>
            </template>
          </div>

          <!-- 未选择章节时的提示 -->
          <div v-else class="no-chapter-selected">
            <i class="pi pi-book-open no-selection-icon"></i>
            <p class="no-selection-text">请从左侧选择一个章节</p>
            <p class="no-selection-hint text-moon/60 text-sm">点击章节标题查看内容</p>
          </div>
        </div>
      </div>

      <!-- 翻译进度工具栏 -->
      <div v-if="isTranslatingChapter" class="translation-progress-toolbar">
        <div class="translation-progress-content">
          <div class="translation-progress-info">
            <div class="translation-progress-header">
              <i class="pi pi-language translation-progress-icon"></i>
              <span class="translation-progress-title">正在翻译章节</span>
            </div>
            <div class="translation-progress-message">
              {{ translationProgress.message || '正在处理...' }}
            </div>
          </div>
          <div class="translation-progress-bar-wrapper">
            <ProgressBar
              :value="
                translationProgress.total > 0
                  ? (translationProgress.current / translationProgress.total) * 100
                  : 0
              "
              :show-value="false"
              class="translation-progress-bar"
            />
            <div class="translation-progress-text">
              {{ translationProgress.current }} / {{ translationProgress.total }}
            </div>
          </div>
          <Button
            icon="pi pi-list"
            :class="[
              'p-button-text p-button-sm translation-progress-history-toggle',
              { 'p-highlight': showAITaskHistory },
            ]"
            :title="showAITaskHistory ? '隐藏 AI 任务历史' : '显示 AI 任务历史'"
            @click="showAITaskHistory = !showAITaskHistory"
          />
          <Button
            icon="pi pi-times"
            label="取消"
            class="p-button-text p-button-sm translation-progress-cancel"
            @click="cancelTranslation"
          />
        </div>
        <!-- AI 任务历史 -->
        <div v-if="showAITaskHistory" class="translation-progress-ai-history">
          <div class="ai-history-content">
            <div v-if="recentAITasks.length === 0" class="ai-history-empty">
              <i class="pi pi-info-circle"></i>
              <span>暂无 AI 任务记录</span>
            </div>
            <div v-else class="ai-history-tasks">
              <!-- 清除已完成/已取消任务按钮 -->
              <div
                v-if="
                  recentAITasks.some(
                    (t) => t.status === 'completed' || t.status === 'error' || t.status === 'cancelled',
                  )
                "
                class="ai-history-clear-actions"
              >
                <Button
                  icon="pi pi-trash"
                  label="清除已完成/已取消的任务"
                  class="p-button-text p-button-sm ai-history-clear-button"
                  @click="clearCompletedTasks"
                />
              </div>
              <div
                v-for="task in recentAITasks"
                :key="task.id"
                class="ai-history-task-item"
                :class="{
                  'task-active': task.status === 'thinking' || task.status === 'processing',
                  'task-completed': task.status === 'completed',
                  'task-error': task.status === 'error',
                  'task-cancelled': task.status === 'cancelled',
                  'task-folded': taskFolded[task.id],
                }"
              >
                <div class="ai-task-header">
                  <div class="ai-task-info">
                    <Button
                      :icon="taskFolded[task.id] ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"
                      class="p-button-text p-button-sm ai-task-fold-toggle"
                      @click="toggleTaskFold(task.id)"
                      title="折叠/展开"
                    />
                    <i
                      class="pi ai-task-status-icon"
                      :class="{
                        'pi-spin pi-spinner':
                          task.status === 'thinking' || task.status === 'processing',
                        'pi-check-circle': task.status === 'completed',
                        'pi-times-circle': task.status === 'error',
                        'pi-ban': task.status === 'cancelled',
                      }"
                    ></i>
                    <span class="ai-task-model">{{ task.modelName }}</span>
                    <Badge
                      :value="taskTypeLabels[task.type] || task.type"
                      severity="info"
                      class="ai-task-type-badge"
                    />
                    <span class="ai-task-status">{{
                      taskStatusLabels[task.status] || task.status
                    }}</span>
                  </div>
                  <div class="ai-task-meta">
                    <span class="ai-task-duration">{{
                      formatTaskDuration(task.startTime, task.endTime)
                    }}</span>
                    <Button
                      v-if="task.status === 'thinking' || task.status === 'processing'"
                      icon="pi pi-stop"
                      class="p-button-text p-button-sm p-button-danger ai-task-stop"
                      @click="void aiProcessingStore.stopTask(task.id)"
                      title="停止任务"
                    />
                  </div>
                </div>
                <Transition name="task-content">
                  <div v-if="!taskFolded[task.id]" class="ai-task-content">
                    <div v-if="task.message" class="ai-task-message">{{ task.message }}</div>
                    <div
                      v-if="task.thinkingMessage && task.thinkingMessage.trim()"
                      class="ai-task-thinking"
                    >
                      <div class="ai-task-thinking-header">
                        <span class="ai-task-thinking-label">思考过程：</span>
                        <Button
                          :icon="autoScrollEnabled[task.id] ? 'pi pi-arrow-down' : 'pi pi-arrows-v'"
                          :class="[
                            'p-button-text p-button-sm ai-task-auto-scroll-toggle',
                            { 'auto-scroll-enabled': autoScrollEnabled[task.id] },
                          ]"
                          :title="
                            autoScrollEnabled[task.id]
                              ? '禁用自动滚动'
                              : '启用自动滚动（新内容出现时自动滚动到底部）'
                          "
                          @click="toggleAutoScroll(task.id)"
                        />
                      </div>
                      <div
                        :ref="(el) => setThinkingContainer(task.id, el as HTMLElement)"
                        class="ai-task-thinking-text"
                      >
                        {{ task.thinkingMessage }}
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 书籍详情布局 */
.book-details-layout {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* 左侧边栏 */
.book-sidebar {
  width: 20rem;
  min-width: 20rem;
  max-width: 20rem;
  border-right: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-3);
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.book-header {
  margin-bottom: 1.5rem;
}

.book-header-content {
  display: flex;
  gap: 0.75rem;
  align-items: stretch;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.book-header-content:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--black-opacity-10);
}

.book-edit-icon {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  font-size: 0.875rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}

.book-header-content:hover .book-edit-icon {
  color: var(--primary-opacity-80);
  transform: scale(1.1);
}

.book-cover-wrapper {
  flex-shrink: 0;
  width: 4rem;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 8px;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
}

.book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.book-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  line-height: 1.4;
  text-align: left;
  word-break: break-word;
  margin: 0;
}

.book-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

/* 统一颜色主题 - 使用渐变色系 */
.stat-item .stat-icon {
  color: #60a5fa; /* blue-400 */
  font-size: 0.75rem;
}

.stat-item .stat-value {
  color: #93c5fd; /* blue-300 */
  font-weight: 600;
}

.stat-item .stat-label {
  color: #bfdbfe; /* blue-200 */
  font-size: 0.75rem;
}

.stat-separator {
  color: var(--moon-opacity-40);
  font-size: 0.75rem;
  user-select: none;
}

.book-separator {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--white-opacity-20), transparent);
  margin-bottom: 0.75rem;
}

.sidebar-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.sidebar-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.volumes-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.volumes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.volume-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.volume-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.volume-header:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
}

.volume-header-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.volume-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.volume-header:hover .volume-actions {
  opacity: 1;
}

.action-button {
  min-width: 1.5rem !important;
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0 !important;
}

.action-button .p-button-icon {
  font-size: 0.75rem !important;
}

.volume-toggle-icon {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.volume-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
  flex-shrink: 0;
}

.volume-title {
  flex: 1;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.volume-chapter-count {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  font-weight: 400;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-left: 1rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--white-opacity-10);
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: move;
}

.chapter-item:hover {
  background: var(--primary-opacity-15);
  color: var(--moon-opacity-95);
  border-color: var(--primary-opacity-30);
  transform: translateX(2px);
}

.chapter-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.chapter-item.drag-over {
  background: var(--primary-opacity-20) !important;
  border-color: var(--primary-opacity-50) !important;
  border-style: dashed !important;
}

.chapter-item-selected {
  background: var(--primary-opacity-15) !important;
  border-color: var(--primary-opacity-40) !important;
  color: var(--moon-opacity-95) !important;
}

.chapter-item-selected .chapter-icon {
  color: var(--primary-opacity-90) !important;
}

.chapters-list.drag-over {
  background: var(--primary-opacity-10);
  border-radius: 6px;
  border: 2px dashed var(--primary-opacity-40);
}

.chapter-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.drag-handle {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
  cursor: grab;
  flex-shrink: 0;
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .drag-handle {
  color: var(--primary-opacity-70);
}

.chapter-item.dragging .drag-handle {
  cursor: grabbing;
}

.chapter-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-actions {
  opacity: 1;
}

.chapter-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-60);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-icon {
  color: var(--primary-opacity-85);
  transform: scale(1.1);
}

.chapter-content .chapter-title {
  flex: 1;
  font-size: inherit;
}

/* 折叠/展开动画 */
.slide-down-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-enter-from {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.slide-down-enter-to {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-from {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
}

/* 设置菜单 */
.settings-menu-wrapper {
  margin-top: -1rem;
  margin-bottom: 1.5rem;
}

.settings-menu-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.75rem 0;
  padding: 0;
}

.settings-menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.settings-menu-separator {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--white-opacity-20), transparent);
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  width: 100%;
}

.settings-menu-item:hover {
  background: var(--primary-opacity-15);
  color: var(--moon-opacity-95);
  border-color: var(--primary-opacity-40);
  transform: translateX(2px);
  box-shadow: 0 2px 6px var(--black-opacity-10);
}

.settings-menu-item-selected {
  background: var(--primary-opacity-15) !important;
  border-color: var(--primary-opacity-50) !important;
  color: var(--moon-opacity-95) !important;
  box-shadow: 0 2px 8px var(--primary-opacity-15) !important;
}

.settings-menu-item-selected .settings-menu-icon {
  color: var(--primary-opacity-90) !important;
}

.settings-menu-icon {
  font-size: 0.875rem;
  color: var(--primary-opacity-70);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.settings-menu-item:hover .settings-menu-icon {
  color: var(--primary-opacity-90);
  transform: scale(1.1);
}

.settings-menu-label {
  flex: 1;
}

.back-link-wrapper {
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--white-opacity-10);
}

.back-link {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--primary-opacity-15);
  border: 1px solid var(--primary-opacity-40);
  border-radius: 8px;
  color: var(--moon-opacity-90);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px var(--primary-opacity-10);
}

.back-link:hover {
  background: var(--primary-opacity-20);
  border-color: var(--primary-opacity-50);
  color: var(--moon-opacity-95);
  transform: translateX(-2px);
  box-shadow: 0 2px 6px var(--primary-opacity-15);
}

.back-link:active {
  transform: translateX(0);
  box-shadow: 0 2px 4px var(--primary-opacity-10);
}

.back-link .pi {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-opacity-80);
}

/* 主内容区域 */
.book-main-content {
  flex: 1;
  overflow-y: hidden; /* Changed from auto to hidden */
  overflow-x: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 章节工具栏 */
.chapter-toolbar {
  flex-shrink: 0;
  padding: 0.75rem 1.5rem;
  background: var(--white-opacity-5);
  border-bottom: 1px solid var(--white-opacity-10);
  backdrop-filter: blur(10px);
  z-index: 10;
}

.toolbar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: 56rem;
  margin: 0 auto;
}

.toolbar-left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.75rem;
  min-width: 0;
  flex-shrink: 0;
  width: 12rem;
  max-width: 12rem;
}

.toolbar-chapter-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  min-width: 0;
  text-align: left;
}

.toolbar-separator {
  width: 1px;
  height: 1.5rem;
  background: var(--white-opacity-20);
  flex-shrink: 0;
  margin: 0 0.75rem;
}

.toolbar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-shrink: 0;
}

.toolbar-button-with-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toolbar-badge {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  min-width: 1.25rem;
  height: 1.25rem;
  font-size: 0.75rem;
  padding: 0 0.375rem;
  z-index: 1;
}

.toolbar-edit-mode-buttons {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.toolbar-edit-mode-buttons .p-button.p-highlight {
  background: var(--primary-opacity-20) !important;
  border-color: var(--primary-opacity-50) !important;
  color: var(--primary-opacity-100) !important;
}

.scrollable-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 页面容器 - 确保有足够的空间 */
.page-container {
  padding-top: 1.5rem;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  padding-bottom: 1.5rem;
  min-height: 100%;
}

/* 章节内容容器 */
.chapter-content-container {
  max-width: 56rem;
  margin: 0 auto;
}

/* 章节标题区域 */
.chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.chapter-content-container .chapter-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.chapter-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.chapter-stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

.chapter-stat-separator {
  color: var(--moon-opacity-40);
  font-size: 0.75rem;
  user-select: none;
}

.chapter-stat-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
}

.chapter-stat-value {
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.chapter-stat-label {
  color: var(--moon-opacity-70);
  font-size: 0.75rem;
}

.chapter-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--moon-opacity-70);
  font-size: 0.875rem;
}

.chapter-meta-icon {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}

.chapter-meta-text {
  color: var(--moon-opacity-70);
}

.chapter-web-url {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  width: fit-content;
  color: var(--primary-opacity-90);
  text-decoration: underline;
  text-decoration-color: var(--primary-opacity-50);
  text-underline-offset: 2px;
  background: var(--primary-opacity-10);
  border: 1px solid var(--primary-opacity-30);
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-web-url:hover {
  color: var(--primary-opacity-100);
  text-decoration-color: var(--primary-opacity-80);
  background: var(--primary-opacity-15);
  border-color: var(--primary-opacity-50);
  transform: translateY(-1px);
}

.chapter-web-url .pi {
  font-size: 0.75rem;
  color: var(--primary-opacity-85);
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-web-url:hover .pi {
  color: var(--primary-opacity-100);
}

/* 段落容器 */
.paragraphs-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 带行号的段落 */
.paragraph-with-line-number {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  position: relative;
}

.line-number {
  display: inline-block;
  flex-shrink: 0;
  width: 3rem;
  text-align: right;
  font-size: 0.8125rem;
  color: var(--moon-opacity-40);
  font-family: ui-monospace, 'Courier New', monospace;
  padding-top: 1rem;
  padding-right: 0.75rem;
  user-select: none;
  align-self: flex-start;
  line-height: 1.8;
  font-weight: 500;
}

.paragraph-with-line-number .paragraph-card {
  flex: 1;
  min-width: 0;
  padding-left: 0;
  position: relative;
}

/* 隐藏 ParagraphCard 中的原始段落符号 */
.paragraph-with-line-number .paragraph-card :deep(.paragraph-icon) {
  display: none !important;
}

/* 原始文本编辑容器 */
.original-text-edit-container {
  padding: 1.5rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
}

.original-text-textarea {
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.8;
  color: var(--moon-opacity-90);
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
}

.original-text-textarea:focus {
  border-color: var(--primary-opacity-50);
  box-shadow: 0 0 0 0.125rem var(--primary-opacity-20);
}

/* 翻译预览容器 */
.translation-preview-container {
  max-width: 56rem;
  margin: 0 auto;
}

.preview-chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.preview-chapter-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.preview-chapter-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.preview-stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

.preview-stat-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
}

.preview-stat-value {
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.preview-stat-label {
  color: var(--moon-opacity-70);
}

.translation-preview-paragraph {
  padding: 1rem 1.25rem;
  width: 100%;
  position: relative;
}

.translation-text {
  margin: 0;
  color: var(--moon-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.untranslated-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.untranslated-badge {
  align-self: flex-start;
}

.original-text {
  margin: 0;
  color: var(--moon-opacity-70);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
}

.untranslated-paragraph {
  background-color: var(--moon-opacity-5);
  border-left: 3px solid var(--orange-500);
  padding-left: calc(1.25rem - 3px);
}

/* 空章节内容状态 */
.empty-chapter-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  color: var(--moon-opacity-40);
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--moon-opacity-80);
  margin: 0 0 0.5rem 0;
}

.empty-hint {
  margin: 0;
}

/* 未选择章节状态 */
.no-chapter-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  min-height: 30rem;
}

.no-selection-icon {
  font-size: 4rem;
  color: var(--moon-opacity-30);
  margin-bottom: 1.5rem;
}

.no-selection-text {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--moon-opacity-70);
  margin: 0 0 0.5rem 0;
}

.no-selection-hint {
  margin: 0;
}

/* 翻译进度工具栏 */
.translation-progress-toolbar {
  flex-shrink: 0;
  padding: 0.75rem 1.5rem;
  background: var(--white-opacity-95);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--white-opacity-20);
  box-shadow: 0 -2px 12px var(--black-opacity-10);
  z-index: 10;
}

.translation-progress-content {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  max-width: 56rem;
  margin: 0 auto;
}

.translation-progress-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.translation-progress-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.translation-progress-icon {
  font-size: 1.125rem;
  color: var(--primary-opacity-80);
}

.translation-progress-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.translation-progress-message {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  line-height: 1.4;
}

.translation-progress-bar-wrapper {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.translation-progress-bar {
  flex: 1;
  height: 0.5rem;
}

.translation-progress-text {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--moon-opacity-80);
  white-space: nowrap;
  min-width: 4rem;
  text-align: right;
}

.translation-progress-history-toggle {
  flex-shrink: 0;
}

.translation-progress-cancel {
  flex-shrink: 0;
}

/* AI 任务历史 */
.translation-progress-ai-history {
  border-top: 1px solid var(--white-opacity-20);
  background: var(--white-opacity-3);
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
}

.ai-history-content {
  padding: 1rem 1.5rem;
}

.ai-history-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--moon-opacity-60);
  font-size: 0.875rem;
}

.ai-history-tasks {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ai-history-clear-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.ai-history-clear-button {
  color: var(--moon-opacity-70);
  font-size: 0.8125rem;
}

.ai-history-clear-button:hover {
  color: var(--red-500);
  background: var(--red-500-opacity-10);
}

.ai-history-task-item {
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-5);
  transition: all 0.2s;
}

.ai-history-task-item.task-active {
  border-color: var(--primary-opacity-30);
  background: var(--primary-opacity-10);
}

.ai-history-task-item.task-completed {
  border-color: var(--green-500-opacity-30);
  background: var(--green-500-opacity-10);
}

.ai-history-task-item.task-error {
  border-color: var(--red-500-opacity-30);
  background: var(--red-500-opacity-10);
}

.ai-history-task-item.task-cancelled {
  border-color: var(--orange-500-opacity-30);
  background: var(--orange-500-opacity-10);
}

.ai-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.ai-task-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.ai-task-fold-toggle {
  padding: 0.25rem;
  min-width: 1.5rem;
  height: 1.5rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s;
}

.ai-task-fold-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-task-status-icon {
  font-size: 0.875rem;
  flex-shrink: 0;
}

.ai-task-status-icon.pi-spinner {
  color: var(--primary-opacity-80);
}

.ai-task-status-icon.pi-check-circle {
  color: var(--green-500);
}

.ai-task-status-icon.pi-times-circle {
  color: var(--red-500);
}

.ai-task-status-icon.pi-ban {
  color: var(--orange-500);
}

.ai-task-model {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  white-space: nowrap;
}

.ai-task-type-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.ai-task-status {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  white-space: nowrap;
}

.ai-task-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.ai-task-duration {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  white-space: nowrap;
}

.ai-task-stop {
  padding: 0.25rem;
  min-width: 1.5rem;
  height: 1.5rem;
}

.ai-task-content {
  overflow: hidden;
}

.ai-task-message {
  font-size: 0.8125rem;
  color: var(--moon-opacity-70);
  margin-top: 0.5rem;
  line-height: 1.4;
}

/* 折叠/展开过渡动画 */
.task-content-enter-active,
.task-content-leave-active {
  transition: all 0.3s ease;
  max-height: 2000px;
  opacity: 1;
}

.task-content-enter-from,
.task-content-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.ai-task-thinking {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-5);
  font-size: 0.75rem;
  line-height: 1.5;
}

.ai-task-thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.ai-task-thinking-label {
  color: var(--moon-opacity-50);
  font-weight: 500;
  margin-right: 0.5rem;
}

.ai-task-auto-scroll-toggle {
  color: var(--moon-opacity-50);
  padding: 0.25rem;
  min-width: auto;
  width: 1.5rem;
  height: 1.5rem;
  transition: all 0.2s;
}

.ai-task-auto-scroll-toggle:hover {
  color: var(--primary-opacity-80);
  background: var(--white-opacity-5);
}

.ai-task-auto-scroll-toggle.auto-scroll-enabled {
  color: var(--primary-opacity-80);
}

.ai-task-thinking-text {
  color: var(--moon-opacity-70);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  display: block;
  scroll-behavior: smooth;
}

/* Term Popover DataView - ensure header stays fixed and content scrolls */
:deep(.term-popover-dataview),
:deep(.character-popover-dataview) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent !important;
}

:deep(.term-popover-dataview .p-dataview-content),
:deep(.character-popover-dataview .p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  background: transparent !important;
}
</style>
