<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import SettingCard from './SettingCard.vue';
import type { Novel, Terminology } from 'src/models/novel';
import ExtractedTermsDialog from './ExtractedTermsDialog.vue';
import TermEditDialog from 'src/components/dialogs/TermEditDialog.vue';
import AppMessage from 'src/components/common/AppMessage.vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { TerminologyService } from 'src/services/terminology-service';
import { useBooksStore } from 'src/stores/books';
import { cloneDeep } from 'lodash';
import co from 'co';

const props = defineProps<{
  book: Novel | null;
}>();

// 搜索关键词
const searchQuery = ref('');

// 将术语转换为显示格式
const allTerminologies = computed(() => {
  if (!props.book?.terminologies) {
    return [];
  }
  return props.book.terminologies.map((term) => ({
    id: term.id,
    name: term.name,
    description: term.description,
    translation: term.translation.translation,
    occurrences: term.occurrences.reduce((sum, occ) => sum + occ.count, 0),
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
const showExtractedTermsDialog = ref(false);
const selectedTerminology = ref<Terminology | null>(null);

const toast = useToastWithHistory();
const confirm = useConfirm();
const isSaving = ref(false);

// 批量操作相关状态
const bulkActionMode = ref(false);
const selectedTermIds = ref<Set<string>>(new Set());

// 文件输入引用（用于导入 JSON）
const fileInputRef = ref<HTMLInputElement | null>(null);

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

// 实现保存逻辑
const handleSave = async (data: { name: string; translation: string; description: string }) => {
  if (!props.book) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '没有选择书籍',
      life: 3000,
    });
    return;
  }

  // 验证必填字段
  if (!data.name.trim()) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '术语名称不能为空',
      life: 3000,
    });
    return;
  }

  isSaving.value = true;

  try {
    if (showAddDialog.value) {
      // 添加新术语
      const termData: {
        name: string;
        translation?: string;
        description?: string;
      } = {
        name: data.name.trim(),
      };
      if (data.translation.trim()) {
        termData.translation = data.translation.trim();
      }
      if (data.description.trim()) {
        termData.description = data.description.trim();
      }
      const newTerm = await TerminologyService.addTerminology(props.book.id, termData);

      toast.add({
        severity: 'success',
        summary: '保存成功',
        detail: `已成功添加术语 "${data.name.trim()}"`,
        life: 3000,
        onRevert: () => TerminologyService.deleteTerminology(props.book!.id, newTerm.id),
      });

      showAddDialog.value = false;
    } else if (showEditDialog.value && selectedTerminology.value) {
      // 编辑现有术语
      const oldTermSnapshot = cloneDeep(selectedTerminology.value);

      const updates: {
        name?: string;
        translation?: string;
        description?: string;
      } = {};
      if (data.name.trim() !== selectedTerminology.value.name) {
        updates.name = data.name.trim();
      }
      if (data.translation.trim() !== selectedTerminology.value.translation.translation) {
        updates.translation = data.translation.trim();
      }
      if (data.description.trim() !== (selectedTerminology.value.description || '')) {
        updates.description = data.description.trim();
      }
      await TerminologyService.updateTerminology(
        props.book.id,
        selectedTerminology.value.id,
        updates,
      );

      toast.add({
        severity: 'success',
        summary: '保存成功',
        detail: `已成功更新术语 "${data.name.trim()}"`,
        life: 3000,
        onRevert: async () => {
          if (oldTermSnapshot && props.book) {
            await TerminologyService.updateTerminology(props.book.id, oldTermSnapshot.id, {
              name: oldTermSnapshot.name,
              translation: oldTermSnapshot.translation.translation,
              ...(oldTermSnapshot.description !== undefined && {
                description: oldTermSnapshot.description,
              }),
            });
          }
        },
      });

      showEditDialog.value = false;
      selectedTerminology.value = null;
    }
  } catch (error) {
    console.error('保存术语失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : '保存术语时发生未知错误',
      life: 3000,
    });
  } finally {
    isSaving.value = false;
  }
};

// 删除术语
const handleDelete = (terminology: (typeof terminologies.value)[number]) => {
  if (!props.book) {
    toast.add({
      severity: 'error',
      summary: '删除失败',
      detail: '没有选择书籍',
      life: 3000,
    });
    return;
  }

  confirm.require({
    group: 'terminology',
    message: `确定要删除术语 "${terminology.name}" 吗？`,
    header: '确认删除',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
    },
    acceptProps: {
      label: '删除',
      severity: 'danger',
    },
    accept: () => {
      void co(function* () {
        try {
          // 保存要删除的术语数据用于撤销
          const termToRestore = props.book?.terminologies?.find((t) => t.id === terminology.id);
          const termSnapshot = termToRestore ? cloneDeep(termToRestore) : null;

          yield TerminologyService.deleteTerminology(props.book!.id, terminology.id);
          toast.add({
            severity: 'success',
            summary: '删除成功',
            detail: `已成功删除术语 "${terminology.name}"`,
            life: 3000,
            onRevert: async () => {
              if (termSnapshot && props.book) {
                const booksStore = useBooksStore();
                const book = booksStore.getBookById(props.book.id);
                if (book) {
                  const current = book.terminologies || [];
                  if (!current.some((t) => t.id === termSnapshot.id)) {
                    await booksStore.updateBook(book.id, {
                      terminologies: [...current, termSnapshot],
                      lastEdited: new Date(),
                    });
                  }
                }
              }
            },
          });
        } catch (error) {
          console.error('删除术语失败:', error);
          toast.add({
            severity: 'error',
            summary: '删除失败',
            detail: error instanceof Error ? error.message : '删除术语时发生未知错误',
            life: 3000,
          });
        }
      });
    },
  });
};

// 打开提取术语对话框
const handleExtractTerms = () => {
  if (!props.book) {
    console.warn('没有选择书籍');
    return;
  }
  showExtractedTermsDialog.value = true;
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
    .slice(0, 3)
    .join('、');
  const moreText = selectedCount > 3 ? `等 ${selectedCount} 个` : '';

  confirm.require({
    group: 'terminology',
    message: `确定要删除选中的 ${selectedCount} 个术语吗？\n${selectedNames}${moreText}`,
    header: '确认批量删除',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: '取消',
      severity: 'secondary',
    },
    acceptProps: {
      label: '删除',
      severity: 'danger',
    },
    accept: () => {
      void co(function* () {
        const idsToDelete = Array.from(selectedTermIds.value);
        // 保存要删除的术语数据用于撤销
        const termsToRestore =
          props.book?.terminologies?.filter((t) => selectedTermIds.value.has(t.id)) || [];
        const termsSnapshot = cloneDeep(termsToRestore);

        let successCount = 0;
        let failCount = 0;

        for (const id of idsToDelete) {
          try {
            yield TerminologyService.deleteTerminology(props.book!.id, id);
            successCount++;
          } catch (error) {
            console.error('删除术语失败:', error);
            failCount++;
          }
        }

        if (successCount > 0) {
          toast.add({
            severity: 'success',
            summary: '批量删除成功',
            detail: `已成功删除 ${successCount} 个术语`,
            life: 3000,
            onRevert: async () => {
              if (termsSnapshot.length > 0 && props.book) {
                const booksStore = useBooksStore();
                const book = booksStore.getBookById(props.book.id);
                if (book) {
                  const current = book.terminologies || [];
                  const toAdd = termsSnapshot.filter(
                    (t: Terminology) => !current.some((c) => c.id === t.id),
                  );
                  if (toAdd.length > 0) {
                    await booksStore.updateBook(book.id, {
                      terminologies: [...current, ...toAdd],
                      lastEdited: new Date(),
                    });
                  }
                }
              }
            },
          });
        }

        if (failCount > 0) {
          toast.add({
            severity: 'warn',
            summary: '部分删除失败',
            detail: `${failCount} 个术语删除失败`,
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
      summary: '导出失败',
      detail: '当前没有可导出的术语',
      life: 3000,
    });
    return;
  }

  try {
    TerminologyService.exportTerminologiesToJson(props.book.terminologies);
    toast.add({
      severity: 'success',
      summary: '导出成功',
      detail: `已成功导出 ${props.book.terminologies.length} 个术语`,
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导出失败',
      detail: error instanceof Error ? error.message : '导出术语时发生未知错误',
      life: 5000,
    });
  }
};

// 导入术语
const handleImport = () => {
  fileInputRef.value?.click();
};

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    return;
  }

  try {
    const importedTerminologies = await TerminologyService.importTerminologiesFromFile(file);

    if (importedTerminologies.length === 0) {
      toast.add({
        severity: 'warn',
        summary: '导入失败',
        detail: '文件中没有有效的术语数据',
        life: 3000,
      });
      target.value = '';
      return;
    }

    if (!props.book) {
      toast.add({
        severity: 'error',
        summary: '导入失败',
        detail: '没有选择书籍',
        life: 3000,
      });
      target.value = '';
      return;
    }

    // 导入术语：合并现有术语，如果名称相同则更新，否则添加
    let addedCount = 0;
    let updatedCount = 0;
    const addedTermIds: string[] = [];
    const updatedTermsSnapshot: Array<{
      id: string;
      name: string;
      translation: string;
      description?: string;
    }> = [];

    for (const importedTerm of importedTerminologies) {
      const existingTerm = props.book.terminologies?.find((t) => t.name === importedTerm.name);

      if (existingTerm) {
        // 保存更新前的状态用于撤销
        updatedTermsSnapshot.push({
          id: existingTerm.id,
          name: existingTerm.name,
          translation: existingTerm.translation.translation,
          ...(existingTerm.description !== undefined
            ? { description: existingTerm.description }
            : {}),
        });
        // 更新现有术语
        await TerminologyService.updateTerminology(props.book.id, existingTerm.id, {
          translation: importedTerm.translation.translation,
          ...(importedTerm.description !== undefined
            ? { description: importedTerm.description }
            : {}),
        });
        updatedCount++;
      } else {
        // 添加新术语
        const newTerm = await TerminologyService.addTerminology(props.book.id, {
          name: importedTerm.name,
          translation: importedTerm.translation.translation,
          ...(importedTerm.description !== undefined
            ? { description: importedTerm.description }
            : {}),
          occurrences: importedTerm.occurrences,
        });
        addedTermIds.push(newTerm.id);
        addedCount++;
      }
    }

    toast.add({
      severity: 'success',
      summary: '导入成功',
      detail: `已导入 ${importedTerminologies.length} 个术语（新增 ${addedCount} 个，更新 ${updatedCount} 个）`,
      life: 3000,
      onRevert: async () => {
        if (!props.book) return;
        const booksStore = useBooksStore();
        const book = booksStore.getBookById(props.book.id);
        if (!book) return;

        // 删除新添加的术语
        for (const id of addedTermIds) {
          await TerminologyService.deleteTerminology(book.id, id);
        }

        // 恢复被更新的术语
        for (const snapshot of updatedTermsSnapshot) {
          await TerminologyService.updateTerminology(book.id, snapshot.id, {
            name: snapshot.name,
            translation: snapshot.translation,
            ...(snapshot.description !== undefined ? { description: snapshot.description } : {}),
          });
        }
      },
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: '导入失败',
      detail: error instanceof Error ? error.message : '导入术语时发生未知错误',
      life: 5000,
    });
  }

  // 清空输入
  target.value = '';
};
</script>

<template>
  <div class="terminology-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="p-6 border-b border-white/10">
      <h1 class="text-2xl font-semibold text-moon-100 mb-2">术语设置</h1>
      <p class="text-sm text-moon/70 mb-3">
        管理小说中的术语及其翻译，这些术语会在翻译过程中被优先使用
      </p>
      <AppMessage
        severity="info"
        message="提示：翻译和描述字段留空时，AI 在翻译章节时会自动填充或更新这些内容"
        :closable="false"
      />
      <AppMessage
        severity="info"
        message="注意：AI 在翻译过程中会根据需要自动创建、更新或删除术语设置项目，以优化翻译质量"
        :closable="false"
      />
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 flex flex-col min-h-0 p-6">
      <!-- 操作栏 -->
      <div
        class="flex-shrink-0 flex items-center justify-between gap-3 mb-4 pb-4 border-b border-white/10 flex-nowrap"
      >
        <!-- 左侧：批量操作控制 -->
        <div v-if="bulkActionMode" class="flex items-center gap-3 flex-shrink-0">
          <Checkbox
            :model-value="isAllSelected"
            :binary="true"
            :indeterminate="isIndeterminate"
            @update:model-value="toggleSelectAll"
          />
          <span class="text-sm text-moon/70">
            已选择 {{ selectedTermIds.size }} / {{ terminologies.length }}
          </span>
          <Button
            label="批量删除"
            icon="pi pi-trash"
            class="p-button-danger flex-shrink-0"
            :disabled="selectedTermIds.size === 0"
            @click="handleBulkDelete"
          />
          <Button
            label="取消"
            icon="pi pi-times"
            class="p-button-text flex-shrink-0"
            @click="toggleBulkActionMode"
          />
        </div>
        <div v-else class="flex items-center gap-2">
          <Button
            label="批量操作"
            icon="pi pi-check-square"
            class="p-button-outlined flex-shrink-0"
            @click="toggleBulkActionMode"
          />
        </div>

        <!-- 右侧：搜索和其他操作 -->
        <div class="flex items-center gap-3 flex-1 justify-end">
          <InputGroup class="search-input-group min-w-0 flex-shrink">
            <InputGroupAddon>
              <i class="pi pi-search text-base" />
            </InputGroupAddon>
            <InputText
              v-model="searchQuery"
              placeholder="搜索术语名称、翻译或描述..."
              class="search-input"
            />
            <InputGroupAddon v-if="searchQuery" class="input-action-addon">
              <Button
                icon="pi pi-times"
                class="p-button-text p-button-sm input-action-button"
                @click="searchQuery = ''"
                title="清除搜索"
              />
            </InputGroupAddon>
          </InputGroup>
          <Button
            label="导出"
            icon="pi pi-download"
            class="p-button-outlined flex-shrink-0"
            :disabled="
              bulkActionMode || !props.book?.terminologies || props.book.terminologies.length === 0
            "
            @click="handleExport"
          />
          <Button
            label="导入"
            icon="pi pi-upload"
            class="p-button-outlined flex-shrink-0"
            :disabled="bulkActionMode"
            @click="handleImport"
          />
          <Button
            label="提取术语"
            icon="pi pi-search"
            class="p-button-outlined flex-shrink-0"
            :disabled="bulkActionMode"
            @click="handleExtractTerms"
          />
          <Button
            label="添加术语"
            icon="pi pi-plus"
            class="p-button-primary flex-shrink-0"
            :disabled="bulkActionMode"
            @click="openAddDialog"
          />
        </div>
      </div>

      <!-- 术语列表 -->
      <div class="flex-1 flex flex-col min-h-0">
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
              <p class="text-moon/70">
                {{ searchQuery ? '未找到匹配的术语' : '暂无术语' }}
              </p>
              <Button
                v-if="!searchQuery"
                label="添加第一个术语"
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
                :translations="
                  terminology.translation && typeof terminology.translation === 'object'
                    ? terminology.translation.translation
                    : terminology.translation
                "
                :occurrences="terminology.occurrences"
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
    </div>

    <!-- 添加术语对话框 -->
    <TermEditDialog
      v-model:visible="showAddDialog"
      mode="add"
      :loading="isSaving"
      @save="handleSave"
    />

    <!-- 编辑术语对话框 -->
    <TermEditDialog
      v-model:visible="showEditDialog"
      mode="edit"
      :term="selectedTerminology"
      :loading="isSaving"
      @save="handleSave"
    />

    <!-- 提取的术语对话框 -->
    <ExtractedTermsDialog
      v-model:visible="showExtractedTermsDialog"
      :book="props.book"
      @saved="() => {}"
    />

    <!-- 确认删除对话框 -->
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

<style scoped>
.terminology-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 使 DataView 使用 flex 布局，内容可滚动，分页器固定在底部 */
:deep(.p-dataview) {
  display: flex;
  flex-direction: column;
  height: 100%;
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
