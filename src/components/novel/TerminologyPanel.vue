<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import DataView from 'primevue/dataview';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputGroup from 'primevue/inputgroup';
import InputGroupAddon from 'primevue/inputgroupaddon';
import type { Novel, Terminology, Translation } from 'src/types/novel';
import ExtractedTermsDialog from './ExtractedTermsDialog.vue';
import TermEditDialog from 'src/components/dialogs/TermEditDialog.vue';
import { useBooksStore } from 'src/stores/books';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { UniqueIdGenerator } from 'src/utils/id-generator';
import { v4 as uuidv4 } from 'uuid';
import { ThemeClasses } from 'src/constants/theme';

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

const booksStore = useBooksStore();
const toast = useToastWithHistory();
const isSaving = ref(false);

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
  if (!data.name) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '术语名称不能为空',
      life: 3000,
    });
    return;
  }

  // 翻译可以为空（留空时由 AI 自动翻译）

  isSaving.value = true;

  try {
    const currentTerminologies = props.book.terminologies || [];
    let updatedTerminologies: Terminology[];

    if (showAddDialog.value) {
      // 添加新术语
      // 检查是否已存在同名术语
      const existingTerm = currentTerminologies.find((t) => t.name === data.name);
      if (existingTerm) {
        toast.add({
          severity: 'warn',
          summary: '保存失败',
          detail: `术语 "${data.name}" 已存在`,
          life: 3000,
        });
        isSaving.value = false;
        return;
      }

      // 生成唯一 ID
      const existingTermIds = currentTerminologies.map((t) => t.id);
      const idGenerator = new UniqueIdGenerator(existingTermIds);
      const termId = idGenerator.generate();

      // 创建 Translation 对象
      const translation: Translation = {
        id: uuidv4(),
        translation: data.translation,
        aiModelId: '', // 可以后续从默认模型获取
      };

      // 创建新术语
      const newTerminology: Terminology = {
        id: termId,
        name: data.name,
        ...(data.description ? { description: data.description } : {}),
        translation,
        occurrences: [],
      };

      updatedTerminologies = [...currentTerminologies, newTerminology];

      // 更新书籍
      await booksStore.updateBook(props.book.id, {
        terminologies: updatedTerminologies,
        lastEdited: new Date(),
      });

      toast.add({
        severity: 'success',
        summary: '保存成功',
        detail: `已成功添加术语 "${newTerminology.name}"`,
        life: 3000,
      });

      showAddDialog.value = false;
    } else if (showEditDialog.value && selectedTerminology.value) {
      // 编辑现有术语
      // 检查名称是否与其他术语冲突（排除当前编辑的术语）
      const nameConflict = currentTerminologies.find(
        (t) => t.id !== selectedTerminology.value!.id && t.name === data.name,
      );
      if (nameConflict) {
        toast.add({
          severity: 'warn',
          summary: '保存失败',
          detail: `术语 "${data.name}" 已存在`,
          life: 3000,
        });
        isSaving.value = false;
        return;
      }

      // 更新术语
      updatedTerminologies = currentTerminologies.map((term) => {
        if (term.id === selectedTerminology.value!.id) {
          const updated: Terminology = {
            ...term,
            name: data.name,
            translation: {
              ...term.translation,
              translation: data.translation,
            },
          };
          // 处理 description：如果有值则设置，如果为空则删除属性
          if (data.description) {
            updated.description = data.description;
          } else {
            delete updated.description;
          }
          return updated;
        }
        return term;
      });

      // 更新书籍
      await booksStore.updateBook(props.book.id, {
        terminologies: updatedTerminologies,
        lastEdited: new Date(),
      });

      toast.add({
        severity: 'success',
        summary: '保存成功',
        detail: `已成功更新术语 "${data.name}"`,
        life: 3000,
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

// TODO: 实现删除逻辑
const handleDelete = (terminology: (typeof terminologies.value)[number]) => {
  // 占位符：删除术语
  console.log('删除术语:', terminology.id);
};

// 打开提取术语对话框
const handleExtractTerms = () => {
  if (!props.book) {
    console.warn('没有选择书籍');
    return;
  }
  showExtractedTermsDialog.value = true;
};

// 处理术语名称更新
// const handleNameUpdate = (value: string) => {
//   formData.value.name = value;
// };

// 处理翻译应用（将翻译结果应用到翻译字段，不更新名称字段）
// const handleTranslationApplied = (result: string) => {
//   // 应用翻译结果到翻译字段
//   formData.value.translation = result;
// };
</script>

<template>
  <div class="terminology-panel h-full flex flex-col">
    <!-- 标题区域 -->
    <div class="p-6 border-b border-white/10">
      <h1 class="text-2xl font-semibold text-moon-100 mb-2">术语设置</h1>
      <p class="text-sm text-moon/70">管理小说中的术语及其翻译，这些术语会在翻译过程中被优先使用</p>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 flex flex-col min-h-0 p-6">
      <!-- 操作栏 -->
      <div class="flex-shrink-0 flex items-center justify-end gap-3 mb-4 flex-nowrap">
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
          label="提取术语"
          icon="pi pi-search"
          class="p-button-outlined flex-shrink-0"
          @click="handleExtractTerms"
        />
        <Button
          label="添加术语"
          icon="pi pi-plus"
          class="p-button-primary flex-shrink-0"
          @click="openAddDialog"
        />
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
              class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 p-2 justify-items-center"
            >
              <div
                v-for="terminology in slotProps.items"
                :key="terminology.id"
                class="terminology-card rounded-lg border border-white/10 bg-white/5 p-2 hover:bg-white/10 transition-colors flex flex-col w-full max-w-[160px]"
              >
                <!-- 术语名称 -->
                <div class="mb-1 min-w-0">
                  <h4
                    class="text-xs font-semibold text-moon/90 line-clamp-1 break-words"
                    :title="terminology.name"
                  >
                    {{ terminology.name }}
                  </h4>
                </div>

                <!-- 翻译 -->
                <div class="mb-1 min-w-0">
                  <p class="text-[10px] text-moon/60 mb-0.5">翻译</p>
                  <p
                    :class="[ThemeClasses.textTranslation, 'text-xs line-clamp-2 break-words']"
                    :title="terminology.translation"
                  >
                    {{ terminology.translation }}
                  </p>
                </div>

                <!-- 描述 -->
                <div v-if="terminology.description" class="mb-1 flex-1 min-w-0">
                  <p class="text-[10px] text-moon/60 mb-0.5">描述</p>
                  <p
                    class="text-[10px] text-moon/70 line-clamp-2 break-words"
                    :title="terminology.description"
                  >
                    {{ terminology.description }}
                  </p>
                </div>

                <!-- 出现次数 -->
                <div class="mb-1 pt-1 border-t border-white/5">
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="text-moon/60">出现次数</span>
                    <span class="text-moon/80 font-medium">{{ terminology.occurrences }}</span>
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="flex gap-1 mt-auto">
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm flex-1 !p-1 !h-6"
                    @click="openEditDialog(terminology)"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-danger flex-1 !p-1 !h-6"
                    @click="handleDelete(terminology)"
                  />
                </div>
              </div>
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
      :book="book"
      @saved="() => {}"
    />
  </div>
</template>

<style scoped>
.terminology-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.terminology-card {
  min-height: 140px;
  max-width: 160px;
  width: 100%;
  overflow: hidden;
  word-wrap: break-word;
  word-break: break-word;
}

.terminology-card > * {
  min-width: 0;
  overflow: hidden;
}

.extracted-term-card {
  min-height: 160px;
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
