<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { cloneDeep, isEqual } from 'lodash';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import AutoComplete from 'primevue/autocomplete';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import AdaptiveDialog from 'src/components/layout/AdaptiveDialog.vue';
import type { Novel, Chapter, CoverImage } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import CoverManagerDialog from './CoverManagerDialog.vue';
import NovelScraperDialog from './NovelScraperDialog.vue';
import BookWebUrlList from './BookWebUrlList.vue';
import BookVolumesTree from './BookVolumesTree.vue';
import BookCoverPanel from './BookCoverPanel.vue';
import TranslatableInput from '../translation/TranslatableInput.vue';
import TranslatableChips from '../translation/TranslatableChips.vue';
import { ChapterService } from 'src/services/chapter-service';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { MemoryService } from 'src/services/memory-service';
import { SettingsService } from 'src/services/settings-service';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useChapterCharCount } from 'src/composables/useChapterCharCount';
import { useFormDialogCloseGuard } from 'src/composables/dialogs/useUnsavedChangesDialog';
import { useUiStore } from 'src/stores/ui';
import { copyTextWithToast } from 'src/utils/clipboard';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    mode: 'add' | 'edit';
    book?: Novel | null;
    loading?: boolean;
  }>(),
  {
    book: null,
    loading: false,
  },
);

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [data: Partial<Novel>];
  cancel: [];
}>();

const idPrefix = computed(() => (props.mode === 'add' ? '' : 'edit'));
const titleInputId = computed<string>(() => {
  const prefix = idPrefix.value;
  return prefix ? `${prefix}-title` : 'title';
});
const toast = useToastWithHistory();
const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

// 表单数据
const formData = ref<Partial<Novel>>({
  title: '',
  alternateTitles: [],
  author: '',
  description: '',
  tags: [],
  webUrl: [],
  translationInstructions: '',
  polishInstructions: '',
  proofreadingInstructions: '',
});

// 封面管理对话框
const showCoverManager = ref(false);

// 爬虫对话框
const showScraper = ref(false);
const scraperInitialUrl = ref<string>('');

// 打开爬虫对话框（可选预设 URL）
const openScraper = (url?: string) => {
  scraperInitialUrl.value = url || '';
  showScraper.value = true;
};

// 表单验证错误
const formErrors = ref<Record<string, string>>({});

// 特殊指令活动标签页
const specialInstructionsActiveTab = ref<string>('translation');

// 确保始终有默认值
const currentSpecialInstructionsActiveTab = computed(
  () => specialInstructionsActiveTab.value || 'translation',
);

// 展开的卷 ID 集合（用于折叠/展开）
const expandedVolumes = ref<Set<string>>(new Set());

// 清除确认对话框
const showClearConfirm = ref(false);
const clearConfirmInput = ref('');

const {
  initialFormSnapshot,
  hasUnsavedChanges,
  closeDialogImmediately,
  showUnsavedCloseConfirm,
  requestCloseDialog,
  confirmDiscardAndClose,
  cancelDiscardAndKeepEditing,
  handleDialogVisibleChange,
} = useFormDialogCloseGuard<Partial<Novel>>({
  formData,
  visible: computed(() => props.visible),
  loading: computed(() => props.loading),
  emit,
});

const hasChildDialogOpen = computed(
  () =>
    showCoverManager.value ||
    showScraper.value ||
    showClearConfirm.value ||
    showUnsavedCloseConfirm.value,
);

// 计算可用的卷和章节（从 formData 或 props.book 获取）
const availableVolumes = computed(() => {
  return formData.value.volumes || props.book?.volumes || [];
});

// 切换卷的展开/折叠状态
const toggleVolume = (volumeId: string) => {
  if (expandedVolumes.value.has(volumeId)) {
    expandedVolumes.value.delete(volumeId);
  } else {
    expandedVolumes.value.add(volumeId);
  }
};

// 使用章节字符数加载 composable（自动处理展开卷和章节列表变化）
const { getChapterCharCountDisplay, isLoadingChapterCharCount, loadAllVisibleChapterCharCounts } =
  useChapterCharCount(availableVolumes, expandedVolumes);

// 重置表单
const resetForm = () => {
  formData.value = {
    title: '',
    alternateTitles: [],
    author: '',
    description: '',
    tags: [],
    webUrl: [],
    translationInstructions: '',
    polishInstructions: '',
    proofreadingInstructions: '',
  };
  formErrors.value = {};
  expandedVolumes.value.clear();
};

// 验证表单
const validateForm = (): boolean => {
  formErrors.value = {};

  if (!formData.value.title?.trim()) {
    formErrors.value.title = '书籍标题不能为空';
  }

  return Object.keys(formErrors.value).length === 0;
};

// 处理保存
const handleSave = () => {
  if (!validateForm()) {
    return;
  }
  emit('save', formData.value);
};

const captureSnapshot = () => {
  initialFormSnapshot.value = cloneDeep(formData.value);
};

// 添加模式导出时仅当字段为真才包含的可选字段（starred 单独处理，因为 false 也需保留）
const OPTIONAL_EXPORT_FIELDS = [
  'alternateTitles',
  'author',
  'description',
  'tags',
  'webUrl',
  'cover',
  'volumes',
] as const;

// 添加模式：基于表单数据构建导出对象（不包含章节内容）
const buildAddModeExportData = (): Novel => {
  const f = formData.value;
  const data: Record<string, unknown> = {
    id: '',
    title: f.title || '',
    createdAt: new Date(),
    lastEdited: new Date(),
  };
  for (const field of OPTIONAL_EXPORT_FIELDS) {
    if (f[field]) {
      data[field] = f[field];
    }
  }
  if (f.starred !== undefined) {
    data.starred = f.starred;
  }
  return data as unknown as Novel;
};

// 编辑模式可被表单覆盖的可选字段（cover / volumes 单独处理）
const EDIT_OVERRIDE_FIELDS = [
  'title',
  'alternateTitles',
  'author',
  'description',
  'tags',
  'webUrl',
  'translationInstructions',
  'polishInstructions',
  'proofreadingInstructions',
] as const;

// 编辑模式：以 props.book 为基底，用当前表单值覆盖未保存的改动后再构建导出对象
const buildEditModeBaseNovel = (): Novel => {
  const f = formData.value;
  const merged: Novel = { ...props.book! };
  const mergedRecord = merged as unknown as Record<string, unknown>;
  for (const field of EDIT_OVERRIDE_FIELDS) {
    if (f[field] !== undefined) {
      mergedRecord[field] = f[field];
    }
  }
  // 封面：表单有值则覆盖，表单显式清除（无 cover 字段）则删除
  if (f.cover) {
    merged.cover = f.cover;
  } else {
    delete merged.cover;
  }
  // 卷章节：表单持有当前（可能已编辑）的结构，覆盖后由 loadAllChapterContentsForNovel 按章节 id 补全内容
  if (f.volumes !== undefined) {
    merged.volumes = f.volumes;
  }
  return merged;
};

// 解析导出数据来源：编辑模式加载完整书籍数据，添加模式使用表单数据
const resolveExportData = async (): Promise<Novel> => {
  if (props.mode === 'edit' && props.book) {
    // 用当前表单值覆盖 props.book，避免丢失对话框里未保存的标题/描述/标签/封面/卷章节改动
    const baseNovel = buildEditModeBaseNovel();
    return ChapterContentService.loadAllChapterContentsForNovel(baseNovel);
  }
  return buildAddModeExportData();
};

// 规范化导出文件名并触发下载（含记忆数据时一并打包）
const downloadNovelExport = (novel: Novel, memories: readonly Memory[]) => {
  const exportPayload = {
    novel,
    ...(memories.length > 0 ? { memories } : {}),
  };
  const title = formData.value.title || props.book?.title || 'book';
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  const timestamp = new Date().toISOString().split('T')[0];
  SettingsService.downloadJson(exportPayload, `${sanitizedTitle}-${timestamp}.json`);
};

// 导出 JSON
const handleExportJson = async () => {
  try {
    const exportData = await resolveExportData();

    // 加载书籍的记忆数据
    const memories = exportData.id ? await MemoryService.getAllMemories(exportData.id) : [];

    downloadNovelExport(exportData, memories);

    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: `书籍数据已成功导出为 JSON 文件${memories.length > 0 ? `（含 ${memories.length} 条记忆）` : ''}`,
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: error instanceof Error ? error.message : '导出 JSON 时发生未知错误',
      life: 3000,
    });
  }
};

// 处理特殊指令标签页切换
const handleSpecialInstructionsTabChange = (value: string | number) => {
  specialInstructionsActiveTab.value = String(value);
};

// 导出按钮文案（手机端简短显示）
const exportLabel = computed(() => (isPhone.value ? '导出' : '导出 JSON'));

// 对话框标题与可关闭状态（集中处理模板中的条件，降低圈复杂度）
const dialogHeader = computed(() => (props.mode === 'add' ? '添加书籍' : '编辑书籍'));
const dialogClosable = computed(() => !props.loading && !hasChildDialogOpen.value);

// 表单字段的回退值（将模板里的 `|| []` / `|| ''` 收敛到 computed）
const alternateTitles = computed(() => formData.value.alternateTitles || []);
const descriptionValue = computed(() => formData.value.description || '');
const tagsValue = computed(() => formData.value.tags || []);
const webUrlValue = computed(() => formData.value.webUrl || []);
const currentCover = computed(() => formData.value.cover || null);

// 标签复制按钮禁用条件：无标签时禁用
const tagsCopyDisabled = computed(() => !formData.value.tags || formData.value.tags.length === 0);

// 清除确认对话框中展示的书名
const clearConfirmBookTitle = computed(() => formData.value.title || props.book?.title);

// 封面管理对话框回写：有封面则赋值，无则清除
const handleCoverUpdate = (cover: CoverImage | null) => {
  if (cover) {
    formData.value.cover = cover;
  } else {
    delete formData.value.cover;
  }
};

// 清除确认按钮的禁用条件（输入的书名需与当前书名匹配）
const clearConfirmDisabled = computed(() => {
  const expected = (formData.value.title || props.book?.title || '').trim();
  return clearConfirmInput.value.trim() !== expected;
});

// 处理应用爬取的数据
const handleApplyScrapedData = (novel: Novel) => {
  // 使用 ChapterService 合并爬取的数据到表单
  const currentBook = props.mode === 'edit' ? props.book : null;
  const mergedData = ChapterService.mergeNovelData(formData.value, novel, {
    updateTitle: true, // 只有当现有标题为空时才更新
    updateAuthor: true,
    updateDescription: true,
    updateTags: true,
    updateWebUrl: true,
    chapterUpdateStrategy: 'merge', // 合并章节属性
  });

  // 更新表单数据
  formData.value = mergedData;

  showScraper.value = false;

  // 自动保存（如果表单验证通过）
  // 在编辑模式下，如果表单有标题（验证通过），自动保存
  // 在添加模式下，如果表单有标题，也尝试保存（让父组件处理）
  if (validateForm()) {
    // 使用 nextTick 确保表单数据已更新
    void nextTick(() => {
      emit('save', formData.value);
      toast.add({
        severity: 'success',
        summary: '导入并保存成功',
        detail: '章节数据已导入并自动保存',
        life: 3000,
      });
    });
  } else {
    // 如果验证失败，提示用户需要填写标题
    toast.add({
      severity: 'warn',
      summary: '应用成功，但未保存',
      detail: '小说信息已应用到表单，但需要填写标题后才能保存',
      life: 3000,
    });
  }
};

// 复制封面 URL
const handleCopyUrl = async () => {
  await copyTextWithToast(formData.value.cover?.url, toast, {
    successDetail: '封面 URL 已复制到剪贴板',
    errorDetail: '无法复制 URL 到剪贴板',
  });
};

// 清除封面
const handleClearCover = () => {
  delete formData.value.cover;
  toast.add({
    severity: 'success',
    summary: '已清除',
    detail: '封面已清除',
    life: 2000,
  });
};

// 清除所有卷和章节（需要输入书名确认）
const handleClearVolumes = () => {
  clearConfirmInput.value = '';
  showClearConfirm.value = true;
};

// 确认清除
const confirmClearVolumes = () => {
  const bookTitle = formData.value.title || props.book?.title || '';
  if (clearConfirmInput.value.trim() === bookTitle.trim()) {
    formData.value.volumes = [];
    expandedVolumes.value.clear();
    showClearConfirm.value = false;
    clearConfirmInput.value = '';
    toast.add({
      severity: 'success',
      summary: '已清除',
      detail: '所有卷和章节已被清除',
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: '书名不匹配',
      detail: '请输入正确的书名以确认清除操作',
      life: 3000,
    });
  }
};

// 取消清除
const cancelClearVolumes = () => {
  showClearConfirm.value = false;
  clearConfirmInput.value = '';
};

// 复制书名
const handleCopyBookTitle = async () => {
  const bookTitle = formData.value.title || props.book?.title || '';
  try {
    await navigator.clipboard.writeText(bookTitle);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '书名已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制书名到剪贴板',
      life: 3000,
    });
  }
};

// 复制所有标签
const handleCopyTags = async () => {
  const tags = formData.value.tags || [];
  if (tags.length === 0) {
    toast.add({
      severity: 'warn',
      summary: '无标签',
      detail: '当前没有标签可复制',
      life: 2000,
    });
    return;
  }

  const tagsText = tags.join(',');
  try {
    await navigator.clipboard.writeText(tagsText);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '所有标签已复制到剪贴板',
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制标签到剪贴板',
      life: 3000,
    });
  }
};

// 字符串字段回退为空字符串（保持原 `value || ''` 语义）
const orBlank = (value: string | undefined): string => value || '';

// 数组字段回退为空数组，并复制一份避免与源数据共享引用
const cloneStringArray = (value: string[] | undefined): string[] => (value ? [...value] : []);

// 编辑模式：根据 props.book 构建 formData，复制各字段避免污染源数据
const buildEditFormData = (): Partial<Novel> => {
  const book = props.book!;
  const data: Partial<Novel> = {
    title: book.title,
    alternateTitles: cloneStringArray(book.alternateTitles),
    author: orBlank(book.author),
    description: orBlank(book.description),
    tags: cloneStringArray(book.tags),
    webUrl: cloneStringArray(book.webUrl),
    translationInstructions: orBlank(book.translationInstructions),
    polishInstructions: orBlank(book.polishInstructions),
    proofreadingInstructions: orBlank(book.proofreadingInstructions),
  };
  if (book.cover) {
    data.cover = { ...book.cover };
  }
  if (book.volumes) {
    // 深拷贝 volumes 数据，确保可以正确编辑
    data.volumes = cloneDeep(book.volumes);
  }
  return data;
};

// 监听 visible 变化，初始化表单
watch(
  () => props.visible,
  async (newVisible) => {
    if (newVisible) {
      if (props.mode === 'edit' && props.book) {
        // 编辑模式：填充现有数据
        formData.value = buildEditFormData();
      } else {
        // 添加模式：重置表单
        resetForm();
      }
      // 重置到默认标签页
      specialInstructionsActiveTab.value = 'translation';
      formErrors.value = {};
      // 等待 DOM 更新后加载字符数
      await nextTick();
      await loadAllVisibleChapterCharCounts();
      captureSnapshot();
    } else {
      // 关闭时重置
      resetForm();
      // 关闭清除确认对话框
      showClearConfirm.value = false;
      clearConfirmInput.value = '';
      showUnsavedCloseConfirm.value = false;
      initialFormSnapshot.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <AdaptiveDialog
    :visible="visible"
    :header="dialogHeader"
    desktop-width="900px"
    desktop-height="90vh"
    eyebrow="BOOK"
    :closable="dialogClosable"
    :dismissable-mask="!hasChildDialogOpen"
    :close-on-escape="!hasChildDialogOpen"
    :sheet-dismiss-on-mask-click="!hasChildDialogOpen"
    dialog-class="book-dialog"
    @update:visible="handleDialogVisibleChange"
  >
    <div class="book-dialog-layout flex flex-col gap-5 py-2 lg:flex-row lg:gap-6">
      <!-- 左侧表单区域 -->
      <div class="flex-1 space-y-5 min-w-0">
        <!-- 书籍标题 -->
        <div class="space-y-2">
          <label :for="titleInputId" class="block text-sm font-medium text-moon/90"
            >书籍标题 *</label
          >
          <TranslatableInput
            v-model="formData.title!"
            :placeholder="'例如: 转生成为史莱姆'"
            :id="titleInputId"
            :invalid="!!formErrors.title"
          />
          <small v-if="formErrors.title" class="p-error block mt-1">{{ formErrors.title }}</small>
        </div>

        <!-- 别名标题 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-alternateTitles`" class="block text-sm font-medium text-moon/90"
            >别名标题</label
          >
          <TranslatableChips
            :id="`${idPrefix}-alternateTitles`"
            :model-value="alternateTitles"
            @update:model-value="
              (value) => {
                formData.alternateTitles = value;
              }
            "
            placeholder="输入别名标题后按回车"
            class="w-full"
          />
          <small class="text-moon/60 block mt-1">输入别名标题后按回车键添加</small>
        </div>

        <!-- 作者 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-author`" class="block text-sm font-medium text-moon/90"
            >作者</label
          >
          <InputText
            :id="`${idPrefix}-author`"
            v-model="formData.author"
            placeholder="例如: 伏瀬"
            class="w-full"
          />
        </div>

        <!-- 描述 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-description`" class="block text-sm font-medium text-moon/90"
            >描述</label
          >
          <TranslatableInput
            :id="`${idPrefix}-description`"
            :model-value="descriptionValue"
            @update:model-value="
              (value) => {
                formData.description = value;
              }
            "
            type="textarea"
            :rows="4"
            :auto-resize="true"
            placeholder="输入书籍描述..."
          />
        </div>

        <!-- 标签 -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label :for="`${idPrefix}-tags`" class="block text-sm font-medium text-moon/90"
              >标签</label
            >
            <Button
              icon="pi pi-copy"
              label="复制标签"
              class="p-button-text p-button-sm"
              size="small"
              :disabled="tagsCopyDisabled"
              @click="handleCopyTags"
            />
          </div>
          <TranslatableChips
            :id="`${idPrefix}-tags`"
            :model-value="tagsValue"
            @update:model-value="
              (value) => {
                formData.tags = value;
              }
            "
            placeholder="输入标签后按回车，或用逗号分隔输入多个标签"
            class="w-full"
            separator=","
          />
          <small class="text-moon/60 block mt-1"
            >输入标签后按回车键添加，或用逗号分隔一次性添加多个标签</small
          >
        </div>

        <!-- 网络地址 -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label :for="`${idPrefix}-webUrl`" class="block text-sm font-medium text-moon/90"
              >网络地址</label
            >
            <Button
              label="从网站获取"
              icon="pi pi-download"
              class="p-button-text p-button-sm"
              size="small"
              @click="openScraper()"
            />
          </div>
          <AutoComplete
            :id="`${idPrefix}-webUrl`"
            :model-value="webUrlValue"
            @update:model-value="
              (value: string[]) => {
                formData.webUrl = value;
              }
            "
            :suggestions="[]"
            multiple
            placeholder="输入网络地址后按回车"
            class="w-full"
            @complete="() => {}"
          />
          <!-- 显示可点击的 URL 列表 -->
          <BookWebUrlList :urls="formData.webUrl" @scrape="openScraper" />
          <small class="text-moon/60 block mt-1"
            >输入网络地址后按回车键添加，或点击按钮从支持的网站获取</small
          >
        </div>

        <!-- 特殊指令 -->
        <div class="space-y-2">
          <div>
            <label class="block text-sm font-medium text-moon/90">特殊指令（书籍级别）</label>
            <small class="text-moon/60 text-xs block mt-1"
              >这些指令将应用于该书籍的所有章节。章节级别的指令会覆盖书籍级别的指令。</small
            >
          </div>
          <Tabs
            :value="currentSpecialInstructionsActiveTab"
            @update:value="handleSpecialInstructionsTabChange"
            class="special-instructions-tabs"
          >
            <TabList>
              <Tab value="translation">翻译指令</Tab>
              <Tab value="polish">润色指令</Tab>
              <Tab value="proofreading">校对指令</Tab>
            </TabList>
            <TabPanels>
              <TabPanel value="translation">
                <div class="space-y-2 pt-2">
                  <Textarea
                    :id="`${idPrefix}-translationInstructions`"
                    v-model="formData.translationInstructions"
                    placeholder="输入翻译任务的特殊指令（可选）"
                    :rows="6"
                    :auto-resize="true"
                    class="w-full"
                  />
                  <small class="text-moon/60 text-xs block"
                    >这些指令将在执行翻译任务时添加到系统提示词中</small
                  >
                </div>
              </TabPanel>
              <TabPanel value="polish">
                <div class="space-y-2 pt-2">
                  <Textarea
                    :id="`${idPrefix}-polishInstructions`"
                    v-model="formData.polishInstructions"
                    placeholder="输入润色任务的特殊指令（可选）"
                    :rows="6"
                    :auto-resize="true"
                    class="w-full"
                  />
                  <small class="text-moon/60 text-xs block"
                    >这些指令将在执行润色任务时添加到系统提示词中</small
                  >
                </div>
              </TabPanel>
              <TabPanel value="proofreading">
                <div class="space-y-2 pt-2">
                  <Textarea
                    :id="`${idPrefix}-proofreadingInstructions`"
                    v-model="formData.proofreadingInstructions"
                    placeholder="输入校对任务的特殊指令（可选）"
                    :rows="6"
                    :auto-resize="true"
                    class="w-full"
                  />
                  <small class="text-moon/60 text-xs block"
                    >这些指令将在执行校对任务时添加到系统提示词中</small
                  >
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>

        <!-- 卷和章节（只读） -->
        <BookVolumesTree
          :volumes="availableVolumes"
          :book="book"
          :expanded-volume-ids="expandedVolumes"
          :get-char-display="getChapterCharCountDisplay"
          :is-loading="isLoadingChapterCharCount"
          @toggle="toggleVolume"
          @clear="handleClearVolumes"
        />
      </div>

      <!-- 右侧封面管理区域 -->
      <div class="w-full flex-shrink-0 lg:w-64">
        <BookCoverPanel
          :cover="formData.cover"
          @manage="showCoverManager = true"
          @clear="handleClearCover"
          @copy-url="handleCopyUrl"
        />
      </div>
    </div>
    <template #footer>
      <div
        class="book-dialog-footer flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <Button
          icon="pi pi-download"
          :label="exportLabel"
          class="p-button-text icon-button-hover self-start sm:self-auto"
          @click="handleExportJson"
        />
        <div class="flex w-full gap-2 sm:w-auto sm:justify-end">
          <Button
            label="取消"
            icon="pi pi-times"
            class="p-button-text icon-button-hover flex-1 sm:flex-none"
            :disabled="loading"
            @click="requestCloseDialog"
          />
          <Button
            label="保存"
            icon="pi pi-check"
            class="p-button-primary icon-button-hover flex-1 sm:flex-none"
            :loading="loading"
            :disabled="loading"
            @click="handleSave"
          />
        </div>
      </div>
    </template>

    <!-- 封面管理对话框 -->
    <CoverManagerDialog
      v-model:visible="showCoverManager"
      :cover="currentCover"
      @update:cover="handleCoverUpdate"
    />

    <!-- 小说爬虫对话框 -->
    <NovelScraperDialog
      v-model:visible="showScraper"
      :current-book="book"
      :initial-url="scraperInitialUrl"
      @apply="handleApplyScrapedData"
    />

    <AdaptiveDialog
      v-model:visible="showUnsavedCloseConfirm"
      header="放弃未保存修改？"
      desktop-width="460px"
      eyebrow="UNSAVED"
      sheet-min-height="auto"
    >
      <div class="space-y-3">
        <p class="text-moon/90">当前表单有未保存修改，关闭后这些修改将丢失。</p>
        <p class="text-moon/70 text-sm">建议先保存，或确认放弃修改后关闭。</p>
      </div>
      <template #footer>
        <Button
          label="继续编辑"
          icon="pi pi-pencil"
          class="p-button-text"
          @click="cancelDiscardAndKeepEditing"
        />
        <Button
          label="放弃修改并关闭"
          icon="pi pi-times"
          class="p-button-danger"
          @click="confirmDiscardAndClose"
        />
      </template>
    </AdaptiveDialog>

    <!-- 清除确认对话框 -->
    <AdaptiveDialog
      v-model:visible="showClearConfirm"
      header="确认清除所有卷和章节"
      desktop-width="500px"
      eyebrow="CLEAR"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          此操作将永久删除所有卷和章节数据，<strong class="text-red-400">无法撤销</strong>。
        </p>
        <p class="text-moon/90">请输入书籍名称以确认：</p>
        <div class="card-base p-3 flex items-center justify-between gap-2">
          <p class="text-primary font-medium break-all flex-1">
            {{ clearConfirmBookTitle }}
          </p>
          <Button
            icon="pi pi-copy"
            class="p-button-text p-button-sm flex-shrink-0"
            size="small"
            title="复制书名"
            @click="handleCopyBookTitle"
          />
        </div>
        <InputText
          v-model="clearConfirmInput"
          placeholder="输入书籍名称"
          class="w-full"
          @keyup.enter="confirmClearVolumes"
        />
        <small class="text-moon/60 block">输入书名后按回车或点击"确认清除"按钮</small>
      </div>
      <template #footer>
        <Button label="取消" icon="pi pi-times" class="p-button-text" @click="cancelClearVolumes" />
        <Button
          label="确认清除"
          icon="pi pi-trash"
          class="p-button-danger"
          :disabled="clearConfirmDisabled"
          @click="confirmClearVolumes"
        />
      </template>
    </AdaptiveDialog>
  </AdaptiveDialog>
</template>

<!-- “特殊指令”页签基础样式（与 EditChapterDialog 共享），详见 special-instructions-tabs.css。
     本对话框独有的横向滚动规则仍保留在下方 scoped 样式块中，置于其后以保证 @media 覆盖生效。 -->
<style scoped src="./special-instructions-tabs.css"></style>

<style scoped>
:deep(.book-dialog .p-dialog-content) {
  overflow-x: hidden;
}

.special-instructions-tabs :deep(.p-tablist-content) {
  overflow-x: auto;
}

.special-instructions-tabs :deep(.p-tablist-tab-list) {
  min-width: max-content;
}

@media (max-width: 640px) {
  .special-instructions-tabs :deep(.p-tab) {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    white-space: nowrap;
  }
}
</style>
