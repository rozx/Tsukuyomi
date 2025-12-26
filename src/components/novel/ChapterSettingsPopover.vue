<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Popover from 'primevue/popover';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import InputSwitch from 'primevue/inputswitch';
import type { Novel, Chapter } from 'src/models/novel';

const props = defineProps<{
  book: Novel | null;
  chapter: Chapter | null;
}>();

const emit = defineEmits<{
  (
    e: 'save',
    data: {
      // 全局设置（书籍级别）
      preserveIndents?: boolean;
      normalizeSymbolsOnDisplay?: boolean;
      normalizeTitleOnDisplay?: boolean;
      // 章节设置（章节级别）
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ): void;
}>();

const popover = ref<InstanceType<typeof Popover> | null>(null);

// 主标签页：全局设置 或 章节设置
const mainTab = ref<string>('global');

// 章节设置内的子标签页（特殊指令类型）
const instructionTab = ref<string>('translation');

// 确保始终有默认值
const currentMainTab = computed(() => mainTab.value || 'global');
const currentInstructionTab = computed(() => instructionTab.value || 'translation');

// 全局设置数据（书籍级别）
// 注意：数据层仍使用 book.preserveIndents（true=保留缩进）
// UI 层使用"过滤开关"（true=过滤掉缩进，即移除行首空格）
const filterIndentsEnabled = ref(false);
// 显示/导出时是否规范化符号（true=开启显示层规范化）
const normalizeSymbolsOnDisplayEnabled = ref(false);
// 显示/导出时是否规范化标题（true=开启显示层规范化）
const normalizeTitleOnDisplayEnabled = ref(false);

// 章节设置数据（章节级别）
const translationInstructions = ref('');
const polishInstructions = ref('');
const proofreadingInstructions = ref('');

// 监听 props 变化，更新表单数据
watch(
  () => [props.book, props.chapter],
  () => {
    // 全局设置（书籍级别）
    if (props.book) {
      const preserveIndents = props.book.preserveIndents ?? true;
      filterIndentsEnabled.value = !preserveIndents;
      normalizeSymbolsOnDisplayEnabled.value = props.book.normalizeSymbolsOnDisplay ?? false;
      normalizeTitleOnDisplayEnabled.value = props.book.normalizeTitleOnDisplay ?? false;
    } else {
      // 默认保留缩进（不过滤）
      filterIndentsEnabled.value = false;
      normalizeSymbolsOnDisplayEnabled.value = false;
      normalizeTitleOnDisplayEnabled.value = false;
    }

    // 章节设置（章节级别）
    if (props.chapter) {
      translationInstructions.value = props.chapter.translationInstructions || '';
      polishInstructions.value = props.chapter.polishInstructions || '';
      proofreadingInstructions.value = props.chapter.proofreadingInstructions || '';
    } else {
      translationInstructions.value = '';
      polishInstructions.value = '';
      proofreadingInstructions.value = '';
      // 如果没有章节，切换到全局设置标签页
      if (mainTab.value === 'chapter') {
        mainTab.value = 'global';
      }
    }

    // 重置到默认标签页（仅在初始化时）
    if (!props.chapter) {
      mainTab.value = 'global';
    }
    instructionTab.value = 'translation';
  },
  { immediate: true },
);

const handleSave = () => {
  // 保存所有设置
  const data: {
    preserveIndents?: boolean;
    normalizeSymbolsOnDisplay?: boolean;
    normalizeTitleOnDisplay?: boolean;
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  } = {
    // 全局设置
    // preserveIndents: true 表示保留缩进；过滤开关开启时应保存为 false
    preserveIndents: !filterIndentsEnabled.value,
    normalizeSymbolsOnDisplay: normalizeSymbolsOnDisplayEnabled.value,
    normalizeTitleOnDisplay: normalizeTitleOnDisplayEnabled.value,
    // 章节设置
    translationInstructions: translationInstructions.value.trim(),
    polishInstructions: polishInstructions.value.trim(),
    proofreadingInstructions: proofreadingInstructions.value.trim(),
  };

  emit('save', data);
  popover.value?.hide();
};

const handleMainTabChange = (value: string | number) => {
  mainTab.value = String(value);
};

const handleInstructionTabChange = (value: string | number) => {
  instructionTab.value = String(value);
};

// Expose popover ref for parent component to toggle
defineExpose({
  popover,
  toggle: (event: Event) => {
    popover.value?.toggle(event);
  },
  hide: () => {
    popover.value?.hide();
  },
});
</script>

<template>
  <Popover ref="popover" style="width: 32rem; max-width: 90vw">
    <div class="flex flex-col max-h-[80vh] overflow-hidden">
      <div class="p-3 border-b border-white/10">
        <h4 class="font-medium text-moon-100">翻译设置</h4>
        <p class="text-xs text-moon/60 mt-1">
          全局设置应用于整个书籍，章节设置仅应用于当前章节
        </p>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="p-4">
          <!-- 主标签页：全局设置 和 章节设置 -->
          <Tabs
            :value="currentMainTab"
            @update:value="handleMainTabChange"
            class="chapter-settings-main-tabs"
          >
            <TabList>
              <Tab value="global">全局设置</Tab>
              <Tab value="chapter" :disabled="!chapter">章节设置</Tab>
            </TabList>
            <TabPanels>
              <!-- 全局设置标签页 -->
              <TabPanel value="global">
                <div class="space-y-4 pt-2">
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <label class="text-sm font-medium text-moon-100 block mb-1">
                        过滤行首空格（缩进）
                      </label>
                      <small class="text-moon/60 text-xs block">
                        启用时，在显示和导出翻译时会自动移除行首空格；禁用时保留所有空格。翻译时始终保留原始缩进，此设置仅影响显示和导出。此设置应用于整个书籍的所有章节。
                      </small>
                    </div>
                    <InputSwitch v-model="filterIndentsEnabled" />
                  </div>

                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <label class="text-sm font-medium text-moon-100 block mb-1">
                        显示时规范化符号
                      </label>
                      <small class="text-moon/60 text-xs block">
                        启用时，仅在显示和导出时规范化译文中的引号、标点、空格等；不会改写或保存译文内容。
                      </small>
                    </div>
                    <InputSwitch v-model="normalizeSymbolsOnDisplayEnabled" />
                  </div>

                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <label class="text-sm font-medium text-moon-100 block mb-1">
                        显示时规范化标题
                      </label>
                      <small class="text-moon/60 text-xs block">
                        启用时，仅在显示和导出时规范化章节标题（如：将全角数字和汉字之间的半角空格转换为全角空格）；不会改写或保存标题内容。
                      </small>
                    </div>
                    <InputSwitch v-model="normalizeTitleOnDisplayEnabled" />
                  </div>
                </div>
              </TabPanel>

              <!-- 章节设置标签页 -->
              <TabPanel value="chapter">
                <div v-if="chapter">
                  <Tabs
                    :value="currentInstructionTab"
                    @update:value="handleInstructionTabChange"
                    class="chapter-settings-instruction-tabs"
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
                            v-model="translationInstructions"
                            placeholder="输入翻译任务的特殊指令（可选）"
                            :rows="8"
                            :auto-resize="true"
                            class="w-full"
                          />
                          <small class="text-moon/60 text-xs block"
                            >这些指令将在执行翻译任务时添加到系统提示词中，仅应用于当前章节</small
                          >
                        </div>
                      </TabPanel>
                      <TabPanel value="polish">
                        <div class="space-y-2 pt-2">
                          <Textarea
                            v-model="polishInstructions"
                            placeholder="输入润色任务的特殊指令（可选）"
                            :rows="8"
                            :auto-resize="true"
                            class="w-full"
                          />
                          <small class="text-moon/60 text-xs block"
                            >这些指令将在执行润色任务时添加到系统提示词中，仅应用于当前章节</small
                          >
                        </div>
                      </TabPanel>
                      <TabPanel value="proofreading">
                        <div class="space-y-2 pt-2">
                          <Textarea
                            v-model="proofreadingInstructions"
                            placeholder="输入校对任务的特殊指令（可选）"
                            :rows="8"
                            :auto-resize="true"
                            class="w-full"
                          />
                          <small class="text-moon/60 text-xs block"
                            >这些指令将在执行校对任务时添加到系统提示词中，仅应用于当前章节</small
                          >
                        </div>
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
                </div>
                <div v-else class="pt-4 text-center text-moon/60 text-sm">
                  请先选择一个章节
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </div>
      <div class="p-3 border-t border-white/10 flex justify-end gap-2">
        <Button label="取消" class="p-button-text p-button-sm" @click="popover?.hide()" />
        <Button label="保存" class="p-button-primary p-button-sm" @click="handleSave" />
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.chapter-settings-main-tabs :deep(.p-tablist) {
  border-bottom: 1px solid var(--white-opacity-10);
  margin-bottom: 0.5rem;
}

.chapter-settings-main-tabs :deep(.p-tab) {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s;
}

.chapter-settings-main-tabs :deep(.p-tab:hover) {
  color: var(--moon-opacity-80);
}

.chapter-settings-main-tabs :deep(.p-tab[aria-selected='true']) {
  color: var(--primary-opacity-90);
  border-bottom-color: var(--primary-opacity-80);
}

.chapter-settings-main-tabs :deep(.p-tabpanels) {
  padding: 0;
}

.chapter-settings-instruction-tabs :deep(.p-tablist) {
  border-bottom: 1px solid var(--white-opacity-10);
  margin-bottom: 0.5rem;
}

.chapter-settings-instruction-tabs :deep(.p-tab) {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s;
}

.chapter-settings-instruction-tabs :deep(.p-tab:hover) {
  color: var(--moon-opacity-80);
}

.chapter-settings-instruction-tabs :deep(.p-tab[aria-selected='true']) {
  color: var(--primary-opacity-90);
  border-bottom-color: var(--primary-opacity-80);
}

.chapter-settings-instruction-tabs :deep(.p-tabpanels) {
  padding: 0;
}
</style>

