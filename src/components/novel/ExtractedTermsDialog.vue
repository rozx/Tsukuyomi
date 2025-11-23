<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Dialog from 'primevue/dialog';
import Slider from 'primevue/slider';
import InputNumber from 'primevue/inputnumber';
import Listbox from 'primevue/listbox';
import type { Novel, Chapter, Volume } from 'src/models/novel';
import { TerminologyService, type ExtractedTermInfo } from 'src/services/terminology-service';
import { useToastWithHistory } from 'src/composables/useToastHistory';

const props = defineProps<{
  visible: boolean;
  book: Novel | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  saved: [];
}>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

const extractedTerms = ref<Map<string, ExtractedTermInfo>>(new Map());
const allExtractedTermsList = ref<Array<ExtractedTermInfo & { word: string; totalCount: number }>>(
  [],
);
const selectedExtractedTerms = ref<Array<ExtractedTermInfo & { word: string; totalCount: number }>>(
  [],
);
const minOccurrenceFilter = ref(3);
const selectedChapters = ref<Chapter[]>([]);
const allVolumes = ref<Volume[]>([]);
const allChapters = ref<Chapter[]>([]);

const toast = useToastWithHistory();
const isSaving = ref(false);

// 计算最大出现次数（用于滑块最大值）
const maxOccurrence = computed(() => {
  if (allExtractedTermsList.value.length === 0) {
    return 100;
  }
  return Math.max(100, Math.max(...allExtractedTermsList.value.map((t) => t.totalCount)));
});

// 获取已添加的术语名称集合
const existingTermNames = computed(() => {
  if (!props.book?.terminologies) {
    return new Set<string>();
  }
  return new Set(props.book.terminologies.map((t) => t.name));
});

// 根据最小出现次数和已添加状态过滤术语列表
// 注意：只包含汉字和包含符号的术语已在服务层过滤
const extractedTermsList = computed(() => {
  return allExtractedTermsList.value.filter(
    (term) =>
      term.totalCount >= minOccurrenceFilter.value && !existingTermNames.value.has(term.word),
  );
});

// 当过滤条件改变时，移除不再符合条件的选中项
watch(minOccurrenceFilter, () => {
  selectedExtractedTerms.value = selectedExtractedTerms.value.filter(
    (term) => term.totalCount >= minOccurrenceFilter.value,
  );
});

// 监听 visible 变化，初始化数据或清空结果
watch(
  () => props.visible,
  (visible) => {
    if (visible && props.book) {
      initializeData();
    } else if (!visible) {
      // 对话框关闭时清空提取结果
      extractedTerms.value = new Map();
      allExtractedTermsList.value = [];
      selectedExtractedTerms.value = [];
      minOccurrenceFilter.value = 3;
    }
  },
);

// 初始化数据
const initializeData = () => {
  if (!props.book) return;

  // 收集所有章节
  const volumes: Volume[] = [];
  const chapters: Chapter[] = [];
  if (props.book.volumes) {
    // 保存完整卷信息以用于分组
    volumes.push(...props.book.volumes.filter((v) => v.chapters && v.chapters.length > 0));

    for (const volume of props.book.volumes) {
      if (volume.chapters) {
        chapters.push(...volume.chapters);
      }
    }
  }

  if (chapters.length === 0) {
    console.warn('没有找到章节');
    return;
  }

  // 保存所有卷和章节
  allVolumes.value = volumes;
  allChapters.value = chapters;
  // 默认选择所有章节
  selectedChapters.value = [...chapters];
};

// 切换卷的选中状态
const toggleVolumeSelection = (volume: Volume) => {
  if (!volume.chapters) return;

  const allSelected = volume.chapters.every((c) =>
    selectedChapters.value.some((sc) => sc.id === c.id),
  );

  if (allSelected) {
    // 取消全选
    selectedChapters.value = selectedChapters.value.filter(
      (sc) => !volume.chapters?.some((c) => c.id === sc.id),
    );
  } else {
    // 全选
    const newChapters = [...selectedChapters.value];
    volume.chapters.forEach((c) => {
      if (!newChapters.some((sc) => sc.id === c.id)) {
        newChapters.push(c);
      }
    });
    selectedChapters.value = newChapters;
  }
};

// 执行提取操作
const executeExtraction = async () => {
  if (selectedChapters.value.length === 0) {
    console.warn('请至少选择一个章节');
    return;
  }

  console.log(`开始提取术语，共 ${selectedChapters.value.length} 个章节`);

  try {
    const terms = await TerminologyService.extractWordsFromChapters(selectedChapters.value);
    console.log('术语提取完成');
    console.log('提取的术语 Map:', terms);

    // 保存提取的术语
    extractedTerms.value = terms;

    // 转换为列表格式用于显示（包含所有术语，不过滤）
    allExtractedTermsList.value = Array.from(terms.entries())
      .map(([word, info]) => ({
        word,
        ...info,
        totalCount: info.occurrences.reduce((sum, occ) => sum + occ.count, 0),
      }))
      .sort((a, b) => b.totalCount - a.totalCount); // 按出现次数降序排序

    // 重置过滤器和选择
    minOccurrenceFilter.value = 3;
    selectedExtractedTerms.value = [];

    // 输出术语详情
    for (const [word, info] of terms.entries()) {
      const totalCount = info.occurrences.reduce((sum, occ) => sum + occ.count, 0);
      console.log(`术语: ${word}`, {
        词性: info.pos,
        品词细分类1: info.posDetail1,
        品词细分类2: info.posDetail2,
        品词细分类3: info.posDetail3,
        总出现次数: totalCount,
        按章节出现: info.occurrences,
      });
    }
  } catch (error) {
    console.error('提取术语失败:', error);
  }
};

// 保存所有术语
const saveAllTerms = async () => {
  if (!props.book) {
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: '没有选择书籍',
      life: 3000,
    });
    return;
  }

  if (extractedTermsList.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: '保存失败',
      detail: '没有可保存的术语',
      life: 3000,
    });
    return;
  }

  isSaving.value = true;

  try {
    // 获取现有的术语名称集合，避免重复添加
    const existingNames = new Set(props.book.terminologies?.map((t) => t.name) || []);

    // 批量添加术语
    let successCount = 0;
    let skippedCount = 0;

    for (const term of extractedTermsList.value) {
      // 跳过已存在的术语
      if (existingNames.has(term.word)) {
        skippedCount++;
        continue;
      }

      try {
        // 使用 TerminologyService 添加术语（会自动统计 occurrences）
        await TerminologyService.addTerminology(props.book.id, {
          name: term.word,
          translation: '', // 翻译为空，需要用户后续填写
          occurrences: term.occurrences, // 使用提取的 occurrences
        });
        successCount++;
        existingNames.add(term.word); // 添加到已存在集合，避免后续重复
      } catch (error) {
        // 如果添加失败（例如名称冲突），跳过该术语
        console.warn(`添加术语 "${term.word}" 失败:`, error);
        skippedCount++;
      }
    }

    if (successCount === 0 && skippedCount > 0) {
      toast.add({
        severity: 'info',
        summary: '保存完成',
        detail: '所有术语已存在，无需重复添加',
        life: 3000,
      });
    } else if (successCount > 0) {
      toast.add({
        severity: 'success',
        summary: '保存成功',
        detail: `已成功保存 ${successCount} 个术语${skippedCount > 0 ? `，跳过 ${skippedCount} 个已存在的术语` : ''}`,
        life: 3000,
      });
    }

    // 清空已选择的术语，因为已经保存
    selectedExtractedTerms.value = [];

    // 通知父组件已保存
    emit('saved');
  } catch (error) {
    console.error('保存术语失败:', error);
    toast.add({
      severity: 'error',
      summary: '保存失败',
      detail: error instanceof Error ? error.message : '保存术语时发生错误',
      life: 3000,
    });
  } finally {
    isSaving.value = false;
  }
};

// 关闭对话框
const closeDialog = () => {
  // 清空提取结果
  extractedTerms.value = new Map();
  allExtractedTermsList.value = [];
  selectedExtractedTerms.value = [];
  minOccurrenceFilter.value = 3;
  dialogVisible.value = false;
};
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    :modal="true"
    :style="{ width: '90vw', maxWidth: '1200px', maxHeight: '97vh' }"
    :closable="true"
    class="extracted-terms-dialog"
  >
    <template #header>
      <div class="flex flex-col gap-2 w-full mr-8">
        <div class="text-xl font-semibold text-moon-100">提取的术语</div>
        <div class="text-sm font-normal text-moon/70">
          共提取到 {{ allExtractedTermsList.length }} 个术语，已添加
          {{ existingTermNames.size }} 个，显示 {{ extractedTermsList.length }} 个（出现次数 >=
          {{ minOccurrenceFilter }}），已选择 {{ selectedExtractedTerms.length }} 个
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-4 flex-1 min-h-0">
        <!-- 章节选择与结果 -->
        <div class="flex gap-4 min-h-0 flex-1">
          <div
            class="w-72 flex-shrink-0 flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div class="flex flex-col gap-3 pb-3 border-b border-white/10">
              <Button
                :label="allExtractedTermsList.length > 0 ? '重新提取' : '提取术语'"
                :icon="allExtractedTermsList.length > 0 ? 'pi pi-refresh' : 'pi pi-search'"
                class="w-full"
                :disabled="selectedChapters.length === 0"
                @click="executeExtraction"
              />
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm text-moon/80 font-medium">最小出现次数</span>
                <InputNumber
                  v-model="minOccurrenceFilter"
                  :min="3"
                  :max="maxOccurrence"
                  showButtons
                  buttonLayout="horizontal"
                  :step="1"
                  decrementButtonClass="p-button-text p-button-sm w-8 h-full !p-0 text-moon/70 hover:text-moon flex items-center justify-center"
                  incrementButtonClass="p-button-text p-button-sm w-8 h-full !p-0 text-moon/70 hover:text-moon flex items-center justify-center"
                  incrementButtonIcon="pi pi-plus"
                  decrementButtonIcon="pi pi-minus"
                  inputClass="w-12 text-center p-0 text-sm bg-transparent border-none shadow-none text-moon outline-none h-full"
                  class="h-8 flex items-center bg-white/5 rounded border border-white/10 overflow-hidden shrink-0"
                />
              </div>
              <Slider
                v-model="minOccurrenceFilter"
                :min="3"
                :max="maxOccurrence"
                :step="1"
                class="w-full"
              />
            </div>

            <div class="text-sm text-moon/80 font-medium">选择章节</div>
            <div class="flex-1 min-h-0">
              <Listbox
                v-model="selectedChapters"
                :options="allVolumes"
                option-label="title"
                option-group-label="title"
                option-group-children="chapters"
                data-key="id"
                multiple
                filter
                checkmark
                class="w-full h-full"
                list-style="max-height: 720px"
              >
                <template #optiongroup="slotProps">
                  <div
                    class="flex items-center gap-2 text-moon/90 font-medium py-1 cursor-pointer hover:bg-white/5 rounded px-1 -mx-1 transition-colors"
                    @click.stop="toggleVolumeSelection(slotProps.option)"
                  >
                    <i class="pi pi-folder text-moon/70"></i>
                    <span class="flex-1 overflow-hidden">{{ slotProps.option.title }}</span>
                  </div>
                </template>
                <template #option="slotProps">
                  <div class="text-sm text-moon/90 pl-2">
                    {{ slotProps.option.title }}
                  </div>
                </template>
              </Listbox>
            </div>
            <div class="text-xs text-moon/70 flex items-center justify-between">
              <span>已选 {{ selectedChapters.length }} / {{ allChapters.length }}</span>
            </div>
            <div class="flex gap-2">
              <Button
                label="全选"
                icon="pi pi-check-square"
                class="p-button-text p-button-sm flex-1"
                @click="selectedChapters = [...allChapters]"
              />
              <Button
                label="清空"
                icon="pi pi-times"
                class="p-button-text p-button-sm flex-1"
                @click="selectedChapters = []"
              />
            </div>
          </div>

          <div
            class="flex-1 min-h-0 flex flex-col rounded-lg border border-white/10 bg-white/5 overflow-hidden"
          >
            <DataTable
              :value="extractedTermsList"
              v-model:selection="selectedExtractedTerms"
              data-key="word"
              :paginator="true"
              :rows="20"
              :rows-per-page-options="[10, 20, 50, 100]"
              paginator-template="RowsPerPageDropdown FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
              :scrollable="true"
              scroll-height="auto"
              class="extracted-terms-table flex-1"
              empty-message="请先选择章节并点击提取术语"
            >
              <Column selection-mode="multiple" header-style="width: 3rem" />
              <Column field="word" header="术语" sortable />
              <Column field="pos" header="词性" sortable />
              <Column field="posDetail1" header="细分类1" sortable />
              <Column field="posDetail2" header="细分类2" sortable />
              <Column field="posDetail3" header="细分类3" sortable />
              <Column field="totalCount" header="总出现次数" sortable>
                <template #body="{ data }">
                  <span class="text-moon/80 font-medium">{{ data.totalCount }}</span>
                </template>
              </Column>
              <Column header="出现章节数" sortable>
                <template #body="{ data }">
                  <span class="text-moon/70">{{ data.occurrences.length }}</span>
                </template>
              </Column>
            </DataTable>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end w-full">
        <Button
          label="保存所有术语"
          icon="pi pi-save"
          class="p-button-primary mt-4"
          :disabled="extractedTermsList.length === 0 || isSaving"
          :loading="isSaving"
          @click="saveAllTerms"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.extracted-terms-dialog :deep(.p-dialog-content) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.extracted-terms-table :deep(.p-datatable-header) {
  background: transparent;
  border: none;
  padding: 0.5rem;
}

.extracted-terms-table :deep(.p-datatable-thead > tr > th) {
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  padding: 0.75rem;
}

.extracted-terms-table :deep(.p-datatable-tbody > tr) {
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.extracted-terms-table :deep(.p-datatable-tbody > tr:hover) {
  background: rgba(255, 255, 255, 0.05);
}

.extracted-terms-table :deep(.p-datatable-tbody > tr > td) {
  padding: 0.75rem;
}

.extracted-terms-table :deep(.p-paginator) {
  background: transparent;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.5rem;
  flex-shrink: 0;
}

/* Listbox checkmark 样式 */
:deep(.p-listbox .p-listbox-list .p-listbox-item .p-checkbox) {
  border-color: rgba(255, 255, 255, 0.3);
  background: transparent;
  border-radius: 4px;
}

:deep(.p-listbox .p-listbox-list .p-listbox-item .p-checkbox.p-checkbox-checked) {
  /* 使用 Luna 主题主色 - 定义在 tailwind.config.cjs 中 */
  background: #f0458b;
  border-color: #f0458b;
}

:deep(.p-listbox .p-listbox-list .p-listbox-item .p-checkbox .p-checkbox-icon) {
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.75rem;
}

:deep(.p-listbox .p-listbox-list .p-listbox-item.p-highlight) {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(246, 243, 209, 0.9);
}

:deep(.p-listbox .p-listbox-list .p-listbox-item) {
  color: rgba(246, 243, 209, 0.8);
}

:deep(.p-listbox .p-listbox-list .p-listbox-item:hover) {
  background: rgba(255, 255, 255, 0.05);
}
</style>
