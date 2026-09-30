<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
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
import BookWebUrlList from './BookWebUrlList.vue';
import BookVolumesTree from './BookVolumesTree.vue';
import BookCoverPanel from './BookCoverPanel.vue';
import TranslatableInput from '../translation/TranslatableInput.vue';
import TranslatableChips from '../translation/TranslatableChips.vue';
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

const router = useRouter();

// 从网站获取：不再在表单里抓取合并，统一交给同步工作区（由同步服务写入）。
// 新建模式跳到新建工作区（可带网址），编辑模式跳到本书的检查更新。
const openSyncWorkspace = (url?: string) => {
  const target =
    props.mode === 'edit' && props.book
      ? `/books/${props.book.id}/settings/update`
      : url
        ? `/books/new/web?url=${encodeURIComponent(url)}`
        : '/books/new/web';
  closeDialogImmediately();
  void router.push(target);
};

const hasChildDialogOpen = computed(
  () => showCoverManager.value || showClearConfirm.value || showUnsavedCloseConfirm.value,
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
    formErrors.value.title = 'titleRequired';
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
      summary: i18nT('bookDialogUi.exportSuccess'),
      detail: i18nT('bookDialogUi.exported', {
        memories:
          memories.length > 0
            ? i18nT('bookDialogUi.exportMemories', { count: memories.length })
            : '',
      }),
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: i18nT('bookDialogUi.exportFailure'),
      detail: error instanceof Error ? error.message : i18nT('bookDialogUi.exportUnknown'),
      life: 3000,
    });
  }
};

// 处理特殊指令标签页切换
const handleSpecialInstructionsTabChange = (value: string | number) => {
  specialInstructionsActiveTab.value = String(value);
};

// 导出按钮文案（手机端简短显示）
const exportLabel = computed(() =>
  isPhone.value ? i18nT('bookDialogUi.export') : i18nT('bookDialogUi.exportJson'),
);

// 对话框标题与可关闭状态（集中处理模板中的条件，降低圈复杂度）
const dialogHeader = computed(() =>
  props.mode === 'add' ? i18nT('libraryUi.addBook') : i18nT('bookDialogUi.editBook'),
);
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

// 复制封面 URL
const handleCopyUrl = async () => {
  await copyTextWithToast(formData.value.cover?.url, toast, {
    successDetail: i18nT('bookDialogUi.copyCoverSuccess'),
    errorDetail: i18nT('bookDialogUi.copyCoverFailure'),
  });
};

// 清除封面
const handleClearCover = () => {
  delete formData.value.cover;
  toast.add({
    severity: 'success',
    summary: i18nT('bookDialogUi.cleared'),
    detail: i18nT('bookDialogUi.coverCleared'),
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
      summary: i18nT('bookDialogUi.cleared'),
      detail: i18nT('bookDialogUi.structureCleared'),
      life: 3000,
    });
  } else {
    toast.add({
      severity: 'error',
      summary: i18nT('bookDialogUi.bookMismatch'),
      detail: i18nT('bookDialogUi.clearMismatch'),
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
      summary: i18nT('libraryUi.copied'),
      detail: i18nT('bookDialogUi.copyNameSuccess'),
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: i18nT('bookDialogUi.copyFailure'),
      detail: i18nT('bookDialogUi.copyNameFailure'),
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
      summary: i18nT('bookDialogUi.noTags'),
      detail: i18nT('bookDialogUi.noTagsHint'),
      life: 2000,
    });
    return;
  }

  const tagsText = tags.join(',');
  try {
    await navigator.clipboard.writeText(tagsText);
    toast.add({
      severity: 'success',
      summary: i18nT('libraryUi.copied'),
      detail: i18nT('bookDialogUi.copyTagsSuccess'),
      life: 2000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: i18nT('bookDialogUi.copyFailure'),
      detail: i18nT('bookDialogUi.copyTagsFailure'),
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
          <label :for="titleInputId" class="block text-sm font-medium text-moon/90">{{
            i18nT('bookDialogUi.title')
          }}</label>
          <TranslatableInput
            v-model="formData.title!"
            :placeholder="i18nT('bookDialogUi.titlePlaceholder')"
            :id="titleInputId"
            :invalid="!!formErrors.title"
          />
          <small v-if="formErrors.title" class="p-error block mt-1">{{
            i18nT('bookDialogUi.titleRequired')
          }}</small>
        </div>

        <!-- 别名标题 -->
        <div class="space-y-2">
          <label
            :for="`${idPrefix}-alternateTitles`"
            class="block text-sm font-medium text-moon/90"
            >{{ i18nT('bookDialogUi.alternateTitles') }}</label
          >
          <TranslatableChips
            :id="`${idPrefix}-alternateTitles`"
            :model-value="alternateTitles"
            @update:model-value="
              (value) => {
                formData.alternateTitles = value;
              }
            "
            :placeholder="i18nT('bookDialogUi.alternatePlaceholder')"
            class="w-full"
          />
          <small class="text-moon/60 block mt-1">{{ i18nT('bookDialogUi.alternateHint') }}</small>
        </div>

        <!-- 作者 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-author`" class="block text-sm font-medium text-moon/90">{{
            i18nT('bookDialogUi.author')
          }}</label>
          <InputText
            :id="`${idPrefix}-author`"
            v-model="formData.author"
            :placeholder="i18nT('bookDialogUi.authorPlaceholder')"
            class="w-full"
          />
        </div>

        <!-- 描述 -->
        <div class="space-y-2">
          <label :for="`${idPrefix}-description`" class="block text-sm font-medium text-moon/90">{{
            i18nT('bookDialogUi.description')
          }}</label>
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
            :placeholder="i18nT('bookDialogUi.descriptionPlaceholder')"
          />
        </div>

        <!-- 标签 -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label :for="`${idPrefix}-tags`" class="block text-sm font-medium text-moon/90">{{
              i18nT('bookDialogUi.tags')
            }}</label>
            <Button
              icon="pi pi-copy"
              :label="i18nT('bookDialogUi.copyTags')"
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
            :placeholder="i18nT('bookDialogUi.tagsPlaceholder')"
            class="w-full"
            separator=","
          />
          <small class="text-moon/60 block mt-1">{{ i18nT('bookDialogUi.tagsHint') }}</small>
        </div>

        <!-- 网络地址 -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label :for="`${idPrefix}-webUrl`" class="block text-sm font-medium text-moon/90">{{
              i18nT('bookDialogUi.webAddresses')
            }}</label>
            <Button
              :label="i18nT('bookDialogUi.fetchWeb')"
              icon="pi pi-download"
              class="p-button-text p-button-sm"
              size="small"
              @click="openSyncWorkspace()"
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
            :placeholder="i18nT('bookDialogUi.webPlaceholder')"
            class="w-full"
            @complete="() => {}"
          />
          <!-- 显示可点击的 URL 列表 -->
          <BookWebUrlList :urls="formData.webUrl" @scrape="openSyncWorkspace" />
          <small class="text-moon/60 block mt-1">{{ i18nT('bookDialogUi.webHint') }}</small>
        </div>

        <!-- 特殊指令 -->
        <div class="space-y-2">
          <div>
            <label class="block text-sm font-medium text-moon/90">{{
              i18nT('bookDialogUi.instructions')
            }}</label>
            <small class="text-moon/60 text-xs block mt-1">{{
              i18nT('bookDialogUi.instructionsHint')
            }}</small>
          </div>
          <Tabs
            :value="currentSpecialInstructionsActiveTab"
            @update:value="handleSpecialInstructionsTabChange"
            class="special-instructions-tabs"
          >
            <TabList>
              <Tab value="translation">{{ i18nT('bookDialogUi.translationInstructions') }}</Tab>
              <Tab value="polish">{{ i18nT('bookDialogUi.polishInstructions') }}</Tab>
              <Tab value="proofreading">{{ i18nT('bookDialogUi.proofreadInstructions') }}</Tab>
            </TabList>
            <TabPanels>
              <TabPanel value="translation">
                <div class="space-y-2 pt-2">
                  <Textarea
                    :id="`${idPrefix}-translationInstructions`"
                    v-model="formData.translationInstructions"
                    :placeholder="i18nT('bookDialogUi.translationPlaceholder')"
                    :rows="6"
                    :auto-resize="true"
                    class="w-full"
                  />
                  <small class="text-moon/60 text-xs block">{{
                    i18nT('bookDialogUi.translationHint')
                  }}</small>
                </div>
              </TabPanel>
              <TabPanel value="polish">
                <div class="space-y-2 pt-2">
                  <Textarea
                    :id="`${idPrefix}-polishInstructions`"
                    v-model="formData.polishInstructions"
                    :placeholder="i18nT('bookDialogUi.polishPlaceholder')"
                    :rows="6"
                    :auto-resize="true"
                    class="w-full"
                  />
                  <small class="text-moon/60 text-xs block">{{
                    i18nT('bookDialogUi.polishHint')
                  }}</small>
                </div>
              </TabPanel>
              <TabPanel value="proofreading">
                <div class="space-y-2 pt-2">
                  <Textarea
                    :id="`${idPrefix}-proofreadingInstructions`"
                    v-model="formData.proofreadingInstructions"
                    :placeholder="i18nT('bookDialogUi.proofreadPlaceholder')"
                    :rows="6"
                    :auto-resize="true"
                    class="w-full"
                  />
                  <small class="text-moon/60 text-xs block">{{
                    i18nT('bookDialogUi.proofreadHint')
                  }}</small>
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
            :label="i18nT('libraryUi.cancel')"
            icon="pi pi-times"
            class="p-button-text icon-button-hover flex-1 sm:flex-none"
            :disabled="loading"
            @click="requestCloseDialog"
          />
          <Button
            :label="i18nT('bookDialogUi.save')"
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

    <AdaptiveDialog
      v-model:visible="showUnsavedCloseConfirm"
      :header="i18nT('bookDialogUi.discardTitle')"
      desktop-width="460px"
      :eyebrow="i18nT('bookDialogUi.unsaved')"
      sheet-min-height="auto"
    >
      <div class="space-y-3">
        <p class="text-moon/90">{{ i18nT('bookDialogUi.unsavedHint') }}</p>
        <p class="text-moon/70 text-sm">{{ i18nT('bookDialogUi.unsavedAdvice') }}</p>
      </div>
      <template #footer>
        <Button
          :label="i18nT('bookDialogUi.continueEditing')"
          icon="pi pi-pencil"
          class="p-button-text"
          @click="cancelDiscardAndKeepEditing"
        />
        <Button
          :label="i18nT('bookDialogUi.discardClose')"
          icon="pi pi-times"
          class="p-button-danger"
          @click="confirmDiscardAndClose"
        />
      </template>
    </AdaptiveDialog>

    <!-- 清除确认对话框 -->
    <AdaptiveDialog
      v-model:visible="showClearConfirm"
      :header="i18nT('bookDialogUi.clearStructure')"
      desktop-width="500px"
      :eyebrow="i18nT('bookDialogUi.clear')"
    >
      <div class="space-y-4">
        <p class="text-moon/90">
          {{ i18nT('bookDialogUi.clearWarning')
          }}<strong class="text-red-400">{{ i18nT('bookDialogUi.cannotUndo') }}</strong
          >。
        </p>
        <p class="text-moon/90">{{ i18nT('bookDialogUi.clearPrompt') }}</p>
        <div class="card-base p-3 flex items-center justify-between gap-2">
          <p class="text-primary font-medium break-all flex-1">
            {{ clearConfirmBookTitle }}
          </p>
          <Button
            icon="pi pi-copy"
            class="p-button-text p-button-sm flex-shrink-0"
            size="small"
            :title="i18nT('bookDialogUi.copyBookName')"
            @click="handleCopyBookTitle"
          />
        </div>
        <InputText
          v-model="clearConfirmInput"
          :placeholder="i18nT('bookDialogUi.enterBookName')"
          class="w-full"
          @keyup.enter="confirmClearVolumes"
        />
        <small class="text-moon/60 block">{{ i18nT('bookDialogUi.clearHint') }}</small>
      </div>
      <template #footer>
        <Button
          :label="i18nT('libraryUi.cancel')"
          icon="pi pi-times"
          class="p-button-text"
          @click="cancelClearVolumes"
        />
        <Button
          :label="i18nT('bookDialogUi.confirmClear')"
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
