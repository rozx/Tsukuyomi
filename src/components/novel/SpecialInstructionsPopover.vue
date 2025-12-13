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
import type { Novel, Chapter } from 'src/models/novel';

const props = defineProps<{
  book: Novel | null;
  chapter: Chapter | null;
}>();

const emit = defineEmits<{
  (
    e: 'save',
    data: {
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ): void;
}>();

const popover = ref<InstanceType<typeof Popover> | null>(null);

// 活动标签页
const activeTab = ref<string>('translation');

// 确保始终有默认值
const currentActiveTab = computed(() => activeTab.value || 'translation');

// 表单数据
const translationInstructions = ref('');
const polishInstructions = ref('');
const proofreadingInstructions = ref('');

// 监听 props 变化，更新表单数据
watch(
  () => [props.book, props.chapter],
  () => {
    if (props.chapter) {
      // 章节级别（覆盖书籍级别）
      translationInstructions.value = props.chapter.translationInstructions || '';
      polishInstructions.value = props.chapter.polishInstructions || '';
      proofreadingInstructions.value = props.chapter.proofreadingInstructions || '';
    } else if (props.book) {
      // 书籍级别
      translationInstructions.value = props.book.translationInstructions || '';
      polishInstructions.value = props.book.polishInstructions || '';
      proofreadingInstructions.value = props.book.proofreadingInstructions || '';
    } else {
      translationInstructions.value = '';
      polishInstructions.value = '';
      proofreadingInstructions.value = '';
    }
    // 重置到默认标签页
    activeTab.value = 'translation';
  },
  { immediate: true },
);

const handleSave = () => {
  // 始终包含所有三个字段，即使为空也要保存（用于清除现有值）
  const data: {
    translationInstructions?: string;
    polishInstructions?: string;
    proofreadingInstructions?: string;
  } = {
    translationInstructions: translationInstructions.value.trim(),
    polishInstructions: polishInstructions.value.trim(),
    proofreadingInstructions: proofreadingInstructions.value.trim(),
  };

  emit('save', data);
  popover.value?.hide();
};

const handleTabChange = (value: string | number) => {
  activeTab.value = String(value);
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
        <h4 class="font-medium text-moon-100">
          {{ chapter ? '章节特殊指令' : '书籍特殊指令' }}
        </h4>
        <p class="text-xs text-moon/60 mt-1">
          {{
            chapter
              ? '这些指令将覆盖书籍级别的指令，仅应用于当前章节'
              : '这些指令将应用于该书籍的所有章节'
          }}
        </p>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="p-4">
          <Tabs
            :value="currentActiveTab"
            @update:value="handleTabChange"
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
                    v-model="translationInstructions"
                    placeholder="输入翻译任务的特殊指令（可选）"
                    :rows="8"
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
                    v-model="polishInstructions"
                    placeholder="输入润色任务的特殊指令（可选）"
                    :rows="8"
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
                    v-model="proofreadingInstructions"
                    placeholder="输入校对任务的特殊指令（可选）"
                    :rows="8"
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
      </div>
      <div class="p-3 border-t border-white/10 flex justify-end gap-2">
        <Button label="取消" class="p-button-text p-button-sm" @click="popover?.hide()" />
        <Button label="保存" class="p-button-primary p-button-sm" @click="handleSave" />
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.special-instructions-tabs :deep(.p-tablist) {
  border-bottom: 1px solid var(--white-opacity-10);
  margin-bottom: 0.5rem;
}

.special-instructions-tabs :deep(.p-tab) {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: var(--moon-opacity-60);
  transition: all 0.2s;
}

.special-instructions-tabs :deep(.p-tab:hover) {
  color: var(--moon-opacity-80);
}

.special-instructions-tabs :deep(.p-tab[aria-selected='true']) {
  color: var(--primary-opacity-90);
  border-bottom-color: var(--primary-opacity-80);
}

.special-instructions-tabs :deep(.p-tabpanels) {
  padding: 0;
}
</style>
