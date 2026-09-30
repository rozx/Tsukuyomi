<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { resolveAppLocale } from 'src/models/locale';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import EntityDeleteConfirmDialog from 'src/components/dialogs/EntityDeleteConfirmDialog.vue';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import SettingCard from './SettingCard.vue';
import type { Novel, Terminology } from 'src/models/novel';
import TermEditDialog from 'src/components/dialogs/TermEditDialog.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useFilePicker } from 'src/composables/dialogs/useFilePicker';
import { useToolbarExpand } from 'src/composables/useToolbarExpand';
import { TerminologyService } from 'src/services/terminology-service';
import { BookService } from 'src/services/book-service';
import { getNameTranslation } from 'src/services/localization/selection';
import { hasDuplicateEntityNames } from 'src/services/localization/entity-identity';
import { useBooksStore } from 'src/stores/books';
import { cloneDeep } from 'lodash';
import co from 'co';
import { v4 } from 'uuid';

const props = defineProps<{
  book: Novel | null;
}>();

const { t, locale } = useI18n();
// 搜索关键词
const searchQuery = ref('');

// 工具栏展开状态（移动端）
const isToolbarExpanded = ref(false);

// 将术语转换为显示格式
const allTerminologies = computed(() => {
  if (!props.book?.terminologies) {
    return [];
  }
  return props.book.terminologies.map((term) => ({
    id: term.id,
    name: term.name,
    description: term.description,
    translation: getNameTranslation(term, props.book?.targetLanguage ?? 'zh-CN')?.translation ?? '',
  }));
});

// 过滤后的术语列表
const terminologies = computed(() => {
  if (!searchQuery.value.trim()) {
    return allTerminologies.value;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return allTerminologies.value.filter((term) => {
    const name = term.name.toLowerCase();
    const translation = term.translation.toLowerCase();
    const description = (term.description || '').toLowerCase();
    return name.includes(query) || translation.includes(query) || description.includes(query);
  });
});

const showAddDialog = ref(false);
const showEditDialog = ref(false);
const selectedTerminology = ref<Terminology | null>(null);

// 工具栏展开图标/标题、空状态文案、导出可用性：把模板内联三元与 || 收敛为 computed
const { toolbarExpandIcon, toolbarExpandTitle } = useToolbarExpand(isToolbarExpanded);
const emptyStateText = computed(() =>
  searchQuery.value ? t('panelUi.noTermMatches') : t('panelUi.noTerms'),
);
const canExportTerms = computed(
  () => !!props.book?.terminologies && props.book.terminologies.length > 0,
);

const hasNameConflicts = computed(() => hasDuplicateEntityNames(props.book?.terminologies ?? []));
const toast = useToastWithHistory();
const confirm = useConfirm();
const isSaving = ref(false);
const isDeleting = ref(false);
const showDeleteConfirm = ref(false);
const deletingTerminology = ref<{
  id: string;
  name: string;
  description?: string | undefined;
  translation: string;
} | null>(null);

// 批量操作相关状态
const bulkActionMode = ref(false);
const selectedTermIds = ref<Set<string>>(new Set());

// 批量模式时自动展开工具栏
watch(bulkActionMode, (v) => {
  if (v) isToolbarExpanded.value = true;
});

// 文件输入引用（用于导入 JSON）
const { fileInputRef, triggerFilePicker: handleImport, createFileSelectHandler } = useFilePicker();

// 打开添加对话框
const openAddDialog = () => {
  showAddDialog.value = true;
};

// 打开编辑对话框
const openEditDialog = (terminology: (typeof terminologies.value)[number]) => {
  // 从 book 中找到完整的术语对象
  const fullTerminology = props.book?.terminologies?.find((t) => t.id === terminology.id);
  if (!fullTerminology) {
    console.warn('未找到术语:', terminology.id);
    return;
  }
  selectedTerminology.value = fullTerminology;
  showEditDialog.value = true;
};

// 构造新增术语载荷（仅在字段非空时写入，避免覆盖 AI 自动填充）
const buildAddTermData = (data: {
  name: string;
  translation: string;
  description: string;
}): { name: string; translation?: string; description?: string } => {
  const termData: { name: string; translation?: string; description?: string } = {
    name: data.name.trim(),
  };
  if (data.translation.trim()) {
    termData.translation = data.translation.trim();
  }
  if (data.description.trim()) {
    termData.description = data.description.trim();
  }
  return termData;
};

// 构造更新字段（仅当与现有值不同时才写入）
const buildTermUpdates = (
  data: { name: string; translation: string; description: string },
  existing: Terminology,
): { name?: string; translation?: string; description?: string } => {
  const updates: { name?: string; translation?: string; description?: string } = {};
  if (data.name.trim() !== existing.name) {
    updates.name = data.name.trim();
  }
  if (
    data.translation.trim() !==
    (getNameTranslation(existing, props.book?.targetLanguage ?? 'zh-CN')?.translation ?? '')
  ) {
    updates.translation = data.translation.trim();
  }
  if (data.description.trim() !== (existing.description || '')) {
    updates.description = data.description.trim();
  }
  return updates;
};

// 新增术语分支
const addTerm = async (data: {
  name: string;
  translation: string;
  description: string;
}): Promise<void> => {
  const termData = buildAddTermData(data);
  const newTerm = await TerminologyService.addTerminology(props.book!.id, termData);

  toast.add({
    severity: 'success',
    summary: t('panelUi.saved'),
    detail: t('panelUi.termAdded', { name: data.name.trim() }),
    life: 3000,
    onRevert: () => TerminologyService.deleteTerminology(props.book!.id, newTerm.id),
  });

  showAddDialog.value = false;
};

// 更新现有术语分支
const updateTerm = async (data: {
  name: string;
  translation: string;
  description: string;
}): Promise<void> => {
  if (!selectedTerminology.value) return;
  const oldTermSnapshot = cloneDeep(selectedTerminology.value);
  const restoreBookId = props.book!.id;
  const restoreOperationId = v4();
  const updates = buildTermUpdates(data, selectedTerminology.value);

  await TerminologyService.updateTerminology(props.book!.id, selectedTerminology.value.id, updates);

  toast.add({
    severity: 'success',
    summary: t('panelUi.saved'),
    detail: t('panelUi.termUpdated', { name: data.name.trim() }),
    life: 3000,
    onRevert: async () => {
      await useBooksStore().restoreEntity(
        restoreBookId,
        'term',
        oldTermSnapshot,
        restoreOperationId,
      );
    },
  });

  showEditDialog.value = false;
  selectedTerminology.value = null;
};

// 实现保存逻辑
const handleSave = async (data: { name: string; translation: string; description: string }) => {
  if (!props.book) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.saveFailed'),
      detail: t('panelUi.noBook'),
      life: 3000,
    });
    return;
  }

  // 验证必填字段
  if (!data.name.trim()) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.saveFailed'),
      detail: t('panelUi.termNameRequired'),
      life: 3000,
    });
    return;
  }

  isSaving.value = true;

  try {
    if (showAddDialog.value) {
      await addTerm(data);
    } else if (showEditDialog.value && selectedTerminology.value) {
      await updateTerm(data);
    }
  } catch (error) {
    console.error('保存术语失败:', error);
    toast.add({
      severity: 'error',
      summary: t('panelUi.saveFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'panelUi.unknownTermSave',
      ),
      life: 3000,
    });
  } finally {
    isSaving.value = false;
  }
};

// 打开删除确认对话框
const openDeleteConfirm = (terminology: (typeof terminologies.value)[number]) => {
  deletingTerminology.value = terminology;
  showDeleteConfirm.value = true;
};

// 确认删除术语
const confirmDeleteTerm = async () => {
  if (!props.book || !deletingTerminology.value || isDeleting.value) {
    return;
  }

  const terminology = deletingTerminology.value;
  isDeleting.value = true;

  try {
    // 保存要删除的术语数据用于撤销
    const termToRestore = props.book?.terminologies?.find((t) => t.id === terminology.id);
    const termSnapshot = termToRestore ? cloneDeep(termToRestore) : null;
    const restoreBookId = props.book.id;
    const restoreOperationId = v4();

    await TerminologyService.deleteTerminology(props.book.id, terminology.id);

    toast.add({
      severity: 'success',
      summary: t('panelUi.deleted'),
      detail: t('panelUi.termDeleted', { name: terminology.name }),
      life: 3000,
      onRevert: async () => {
        if (termSnapshot)
          await useBooksStore().restoreEntity(
            restoreBookId,
            'term',
            termSnapshot,
            restoreOperationId,
          );
      },
    });

    showDeleteConfirm.value = false;
    deletingTerminology.value = null;
  } catch (error) {
    console.error('删除术语失败:', error);
    toast.add({
      severity: 'error',
      summary: t('panelUi.deleteFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'panelUi.unknownTermDelete',
      ),
      life: 3000,
    });
  } finally {
    isDeleting.value = false;
  }
};

// 删除术语（保留兼容性，调用新的删除确认函数）
const handleDelete = (terminology: (typeof terminologies.value)[number]) => {
  if (!props.book) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.deleteFailed'),
      detail: t('panelUi.noBook'),
      life: 3000,
    });
    return;
  }
  openDeleteConfirm(terminology);
};

// 切换批量操作模式
const toggleBulkActionMode = () => {
  bulkActionMode.value = !bulkActionMode.value;
  if (!bulkActionMode.value) {
    selectedTermIds.value.clear();
  }
};

// 处理单个术语的选中状态
const handleTermCheck = (checked: boolean, termId?: string) => {
  if (!termId) return;
  if (checked) {
    selectedTermIds.value.add(termId);
  } else {
    selectedTermIds.value.delete(termId);
  }
};

// 全选/取消全选
const toggleSelectAll = () => {
  if (selectedTermIds.value.size === terminologies.value.length) {
    selectedTermIds.value.clear();
  } else {
    selectedTermIds.value = new Set(terminologies.value.map((t) => t.id));
  }
};

// 计算是否全选
const isAllSelected = computed(() => {
  return (
    terminologies.value.length > 0 && selectedTermIds.value.size === terminologies.value.length
  );
});

// 计算是否有部分选中
const isIndeterminate = computed(() => {
  return selectedTermIds.value.size > 0 && selectedTermIds.value.size < terminologies.value.length;
});

// 批量删除
const handleBulkDelete = () => {
  if (!props.book || selectedTermIds.value.size === 0) return;

  const selectedCount = selectedTermIds.value.size;
  const selectedNames = terminologies.value
    .filter((t) => selectedTermIds.value.has(t.id))
    .map((t) => t.name)
    .slice(0, 3);

  const restoreBookId = props.book.id;
  const restoreOperationId = v4();
  const idsToDelete = Array.from(selectedTermIds.value);
  const termsSnapshot = cloneDeep(
    props.book.terminologies?.filter((term) => selectedTermIds.value.has(term.id)) ?? [],
  );
  confirm.require({
    group: 'terminology',
    get message() {
      return t('panelUi.bulkDeleteQuestion', {
        count: selectedCount,
        names: selectedNames.join(t('panelUi.separator')),
        more: selectedCount > 3 ? t('panelUi.moreNames', { count: selectedCount }) : '',
      });
    },
    get header() {
      return t('panelUi.confirmBulkDelete');
    },
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      get label() {
        return t('panelUi.cancel');
      },
      severity: 'secondary',
    },
    acceptProps: {
      get label() {
        return t('panelUi.delete');
      },
      severity: 'danger',
    },
    accept: () => {
      void co(function* () {
        const deletedIds = new Set<string>();

        let successCount = 0;
        let failCount = 0;

        for (const id of idsToDelete) {
          try {
            yield TerminologyService.deleteTerminology(restoreBookId, id);
            deletedIds.add(id);
            successCount++;
          } catch (error) {
            console.error('删除术语失败:', error);
            failCount++;
          }
        }

        if (successCount > 0) {
          toast.add({
            severity: 'success',
            summary: t('panelUi.bulkDeleted'),
            detail: t('panelUi.deletedTerms', { count: successCount }),
            life: 3000,
            onRevert: async () => {
              for (const term of termsSnapshot.filter((item) => deletedIds.has(item.id))) {
                await useBooksStore().restoreEntity(
                  restoreBookId,
                  'term',
                  term,
                  `${restoreOperationId}:${term.id}`,
                );
              }
            },
          });
        }

        if (failCount > 0) {
          toast.add({
            severity: 'warn',
            summary: t('panelUi.partialDeleteFailed'),
            detail: t('panelUi.failedTerms', { count: failCount }),
            life: 3000,
          });
        }

        selectedTermIds.value.clear();
        bulkActionMode.value = false;
      });
    },
  });
};

// 导出术语为 JSON
const handleExport = () => {
  if (!props.book?.terminologies || props.book.terminologies.length === 0) {
    toast.add({
      severity: 'warn',
      summary: t('panelUi.exportFailed'),
      detail: t('panelUi.noExportTerms'),
      life: 3000,
    });
    return;
  }

  try {
    TerminologyService.exportTerminologiesToJson(props.book.terminologies);
    toast.add({
      severity: 'success',
      summary: t('panelUi.exported'),
      detail: t('panelUi.exportedTerms', { count: props.book.terminologies.length }),
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.exportFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'panelUi.unknownTermExport',
      ),
      life: 5000,
    });
  }
};

// 导入术语的撤销快照（仅记录被更新条目的可恢复字段）
type UpdatedTermSnapshot = Terminology;

interface TermsImportResult {
  revertOperationId: string;
  addedCount: number;
  updatedCount: number;
  addedTermIds: string[];
  updatedTermsSnapshot: UpdatedTermSnapshot[];
}

// 整次导入保留文件的语言归属，并按稳定身份做差异写入。
const executeTermsImport = async (
  bookId: string,
  importedTerminologies: Terminology[],
): Promise<TermsImportResult> => {
  const result = await BookService.importEntities(bookId, 'term', importedTerminologies);
  await useBooksStore().refreshBookFromStorage(bookId);
  return {
    addedCount: result.addedIds.length,
    updatedCount: result.updatedBefore.length,
    addedTermIds: result.addedIds,
    updatedTermsSnapshot: result.updatedBefore,
    revertOperationId: v4(),
  };
};

// 撤销导入：删除新增条目，恢复被更新条目的快照字段
const revertTermsImport = async (bookId: string, result: TermsImportResult): Promise<void> => {
  for (const id of result.addedTermIds) {
    const book = useBooksStore().getBookById(bookId);
    if (!book) throw new Error('BOOK_MISSING');
    if (book.terminologies?.some((item) => item.id === id))
      await TerminologyService.deleteTerminology(bookId, id);
  }
  for (const snapshot of result.updatedTermsSnapshot) {
    await useBooksStore().restoreEntity(
      bookId,
      'term',
      snapshot,
      `${result.revertOperationId}:${snapshot.id}`,
    );
  }
};

// 处理文件选择
const handleFileSelect = createFileSelectHandler(async (file) => {
  try {
    const importedTerminologies = await TerminologyService.importTerminologiesFromFile(file);

    if (importedTerminologies.length === 0) {
      toast.add({
        severity: 'warn',
        summary: t('panelUi.importFailed'),
        detail: t('panelUi.noImportTerms'),
        life: 3000,
      });
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: t('panelUi.importFailed'),
        detail: t('panelUi.noBook'),
        life: 3000,
      });
      return;
    }

    const result = await executeTermsImport(props.book.id, importedTerminologies);

    // 与 CharacterSettingPanel 的导入成功 toast 结构高度相似（onRevert 前序步骤一致），
    // 但后续恢复更新逻辑各自维护不同字段集合，强行抽公共回调反而更复杂，保留两处实现。
    toast.add({
      severity: 'success',
      summary: t('panelUi.imported'),
      // fallow-ignore-next-line code-duplication
      detail: t('panelUi.importedTerms', {
        count: importedTerminologies.length,
        added: result.addedCount,
        updated: result.updatedCount,
      }),
      life: 3000,
      onRevert: async () => {
        if (!props.book) return;
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(props.book.id);
        if (!book) return;
        await revertTermsImport(book.id, result);
      },
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('panelUi.importFailed'),
      detail: localizedErrorMessage(
        error,
        resolveAppLocale(locale.value),
        'panelUi.unknownTermImport',
      ),
      life: 5000,
    });
  }
});
</script>

<template>
  <div class="terminology-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="panel-header border-b border-white/10">
      <h1 class="panel-title font-semibold text-moon-100">{{ t('panelUi.termTitle') }}</h1>
      <p class="panel-desc text-sm text-moon/70">{{ t('panelUi.termDescription') }}</p>
    </div>

    <!-- 操作栏 -->
    <div
      class="panel-toolbar border-b border-white/10 flex-none bg-surface-900/95 backdrop-blur support-backdrop-blur:bg-surface-900/50 sticky top-0 z-10"
      :class="{ 'toolbar-expanded': isToolbarExpanded }"
    >
      <!-- 移动端紧凑操作栏 -->
      <div class="toolbar-mobile-compact">
        <span class="text-sm text-moon/60">{{
          t('panelUi.termCount', { count: terminologies.length })
        }}</span>
        <Button
          :icon="toolbarExpandIcon"
          size="small"
          class="p-button-text"
          @click="isToolbarExpanded = !isToolbarExpanded"
          :title="toolbarExpandTitle"
        />
      </div>
      <!-- 可折叠内容（搜索 + 操作） -->
      <div class="toolbar-row toolbar-expandable">
        <!-- 左侧：搜索栏 / 批量操作控制 -->
        <div v-if="bulkActionMode" class="flex items-center gap-2 flex-shrink-0">
          <Checkbox
            :model-value="isAllSelected"
            :binary="true"
            :indeterminate="isIndeterminate"
            @update:model-value="toggleSelectAll"
          />
          <span class="text-sm text-moon/70 whitespace-nowrap">
            {{ selectedTermIds.size }} / {{ terminologies.length }}
          </span>
        </div>
        <InputGroup v-else class="search-input-group min-w-0 flex-1">
          <InputGroupAddon>
            <i class="pi pi-search text-base" />
          </InputGroupAddon>
          <InputText
            v-model="searchQuery"
            :placeholder="t('panelUi.termSearch')"
            class="search-input"
          />
          <InputGroupAddon v-if="searchQuery" class="input-action-addon">
            <Button
              icon="pi pi-times"
              class="p-button-text p-button-sm input-action-button"
              @click="searchQuery = ''"
              :title="t('panelUi.clearSearch')"
            />
          </InputGroupAddon>
        </InputGroup>

        <!-- 右侧：操作按钮 -->
        <div class="toolbar-actions">
          <!-- 批量模式下的按钮 -->
          <template v-if="bulkActionMode">
            <Button
              :label="t('panelUi.delete')"
              icon="pi pi-trash"
              class="p-button-danger flex-shrink-0"
              :disabled="selectedTermIds.size === 0"
              @click="handleBulkDelete"
            />
            <Button
              :label="t('panelUi.cancel')"
              icon="pi pi-times"
              class="p-button-text flex-shrink-0"
              @click="toggleBulkActionMode"
            />
          </template>
          <!-- 普通模式下的按钮 -->
          <template v-else>
            <Button
              :label="t('panelUi.batch')"
              icon="pi pi-check-square"
              size="small"
              class="p-button-outlined flex-shrink-0"
              @click="toggleBulkActionMode"
            />
            <Button
              :label="t('panelUi.export')"
              icon="pi pi-upload"
              size="small"
              class="p-button-outlined flex-shrink-0"
              :disabled="!canExportTerms"
              @click="handleExport"
            />
            <Button
              :label="t('panelUi.import')"
              icon="pi pi-download"
              size="small"
              class="p-button-outlined flex-shrink-0"
              @click="handleImport"
            />
            <Button
              :label="t('panelUi.addTerm')"
              icon="pi pi-plus"
              size="small"
              class="p-button-primary flex-shrink-0"
              @click="openAddDialog"
            />
          </template>
        </div>
      </div>
      <AppMessage
        severity="info"
        class="panel-message toolbar-expandable"
        :message="t('panelUi.termAiHint')"
        :closable="false"
      />
    </div>

    <AppMessage
      v-if="hasNameConflicts"
      severity="warn"
      :message="t('books.nameConflict')"
      :closable="false"
      class="m-4"
    />

    <!-- 内容区域 -->
    <div class="flex-1 p-6 min-h-0">
      <!-- 术语列表 -->
      <DataView
        :value="terminologies"
        data-key="id"
        layout="grid"
        :rows="96"
        :paginator="terminologies.length > 0"
        :rows-per-page-options="[96, 144, 192, 288]"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        class="flex-1 flex flex-col min-h-0"
      >
        <template #empty>
          <div class="text-center py-12">
            <i class="pi pi-book text-4xl text-moon/50 mb-4" />
            <p class="text-moon/70">{{ emptyStateText }}</p>
            <Button
              v-if="!searchQuery"
              :label="t('panelUi.firstTerm')"
              icon="pi pi-plus"
              class="p-button-primary mt-4"
              @click="openAddDialog"
            />
          </div>
        </template>

        <template #grid="slotProps">
          <div
            class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 pb-4"
            style="grid-template-columns: repeat(auto-fill, minmax(300px, min(1fr, 500px)))"
          >
            <SettingCard
              v-for="terminology in slotProps.items"
              :key="terminology.id"
              :title="terminology.name"
              :description="terminology.description"
              :translations="terminology.translation"
              :show-checkbox="bulkActionMode"
              :checked="selectedTermIds.has(terminology.id)"
              :item-id="terminology.id"
              @edit="openEditDialog(terminology)"
              @delete="handleDelete(terminology)"
              @check="handleTermCheck"
            />
          </div>
        </template>
      </DataView>
    </div>

    <!-- 添加术语对话框 -->
    <TermEditDialog
      :target-language="book?.targetLanguage ?? 'zh-CN'"
      v-model:visible="showAddDialog"
      mode="add"
      :loading="isSaving"
      @save="handleSave"
    />

    <!-- 编辑术语对话框 -->
    <TermEditDialog
      :target-language="book?.targetLanguage ?? 'zh-CN'"
      v-model:visible="showEditDialog"
      mode="edit"
      :term="selectedTerminology"
      :loading="isSaving"
      @save="handleSave"
    />

    <!-- 确认删除对话框 -->
    <EntityDeleteConfirmDialog
      v-model:visible="showDeleteConfirm"
      :name="deletingTerminology?.name ?? null"
      :loading="isDeleting"
      header-key="structureUi.confirmDeleteTerm"
      question-key="structureUi.deleteTermQuestion"
      warning-key="structureUi.cannotUndo"
      @confirm="confirmDeleteTerm"
    />

    <!-- 保留 ConfirmDialog 用于其他可能的确认操作 -->
    <ConfirmDialog group="terminology" />

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="handleFileSelect"
    />
  </div>
</template>

<!-- 标题区样式（五个设置面板共享），详见 panel-header.css -->
<style scoped src="./panel-header.css"></style>
<!-- 工具栏外壳通用样式（三个设置面板共享），详见 setting-panel.css -->
<style scoped src="./setting-panel.css"></style>

<style scoped>
.terminology-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 移动端响应式（本面板独有部分） */
@media (max-width: 640px) {
  .toolbar-row .search-input-group {
    flex: 1 1 100%;
    min-width: 0;
  }

  /* 次要按钮（outlined）只显示图标 */
  .toolbar-actions :deep(.p-button-outlined .p-button-label) {
    display: none;
  }
}

/* 使 DataView 使用 flex 布局，内容可滚动，分页器固定在底部 */
:deep(.p-dataview) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  background: transparent !important;
}

:deep(.p-paginator) {
  flex-shrink: 0;
  margin-top: auto;
}
</style>
