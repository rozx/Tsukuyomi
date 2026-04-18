<script setup lang="ts">
/**
 * 章节/书籍设置面板的内容部分。桌面 Popover 和手机 MobileBottomSheet 共享同一份。
 * 父面板监听 `save` / `close` 事件来关闭 shell 并上抛保存数据。
 */
import { computed, ref, watch } from 'vue';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import InputSwitch from 'primevue/inputswitch';
import InputNumber from 'primevue/inputnumber';
import type { Novel, Chapter } from 'src/models/novel';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  MIN_TASK_CHUNK_SIZE,
  MAX_TASK_CHUNK_SIZE,
  resolveTaskChunkSize,
} from 'src/services/ai/tasks/utils/chunk-formatter';

const props = defineProps<{
  book: Novel | null;
  chapter: Chapter | null;
}>();

const emit = defineEmits<{
  (
    e: 'save',
    data: {
      preserveIndents?: boolean;
      normalizeSymbolsOnDisplay?: boolean;
      normalizeTitleOnDisplay?: boolean;
      translationChunkSize?: number;
      skipAskUser?: boolean;
      enableOriginalTextValidation?: boolean;
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ): void;
  (e: 'close'): void;
}>();

const mainTab = ref<string>('global');
const instructionTab = ref<string>('translation');
const currentMainTab = computed(() => mainTab.value || 'global');
const currentInstructionTab = computed(() => instructionTab.value || 'translation');

const filterIndentsEnabled = ref(false);
const normalizeSymbolsOnDisplayEnabled = ref(false);
const normalizeTitleOnDisplayEnabled = ref(false);
const translationChunkSize = ref<number | null>(null);
const skipAskUserEnabled = ref(false);
const enableOriginalTextValidation = ref(false);

const translationInstructions = ref('');
const polishInstructions = ref('');
const proofreadingInstructions = ref('');

watch(
  () => [props.book, props.chapter],
  () => {
    if (props.book) {
      const preserveIndents = props.book.preserveIndents ?? true;
      filterIndentsEnabled.value = !preserveIndents;
      normalizeSymbolsOnDisplayEnabled.value = props.book.normalizeSymbolsOnDisplay ?? false;
      normalizeTitleOnDisplayEnabled.value = props.book.normalizeTitleOnDisplay ?? false;
      translationChunkSize.value = resolveTaskChunkSize(props.book.translationChunkSize);
      skipAskUserEnabled.value = props.book.skipAskUser ?? false;
      enableOriginalTextValidation.value = props.book.enableOriginalTextValidation ?? false;
    } else {
      filterIndentsEnabled.value = false;
      normalizeSymbolsOnDisplayEnabled.value = false;
      normalizeTitleOnDisplayEnabled.value = false;
      translationChunkSize.value = DEFAULT_TASK_CHUNK_SIZE;
      skipAskUserEnabled.value = false;
      enableOriginalTextValidation.value = false;
    }

    if (props.chapter) {
      translationInstructions.value = props.chapter.translationInstructions || '';
      polishInstructions.value = props.chapter.polishInstructions || '';
      proofreadingInstructions.value = props.chapter.proofreadingInstructions || '';
    } else {
      translationInstructions.value = '';
      polishInstructions.value = '';
      proofreadingInstructions.value = '';
      if (mainTab.value === 'chapter') {
        mainTab.value = 'global';
      }
    }

    if (!props.chapter) mainTab.value = 'global';
    instructionTab.value = 'translation';
  },
  { immediate: true },
);

const handleSave = () => {
  emit('save', {
    preserveIndents: !filterIndentsEnabled.value,
    normalizeSymbolsOnDisplay: normalizeSymbolsOnDisplayEnabled.value,
    normalizeTitleOnDisplay: normalizeTitleOnDisplayEnabled.value,
    translationChunkSize: resolveTaskChunkSize(translationChunkSize.value ?? undefined),
    skipAskUser: skipAskUserEnabled.value,
    enableOriginalTextValidation: enableOriginalTextValidation.value,
    translationInstructions: translationInstructions.value.trim(),
    polishInstructions: polishInstructions.value.trim(),
    proofreadingInstructions: proofreadingInstructions.value.trim(),
  });
  emit('close');
};

const handleCancel = () => emit('close');

const handleMainTabChange = (value: string | number) => {
  mainTab.value = String(value);
};

const handleInstructionTabChange = (value: string | number) => {
  instructionTab.value = String(value);
};
</script>

<template>
  <div class="chapter-settings-body flex flex-col h-full overflow-hidden">
    <div class="cs-header p-3 border-b border-white/10 flex-shrink-0">
      <h4 class="font-medium text-moon-100">翻译设置</h4>
      <p class="text-xs text-moon/60 mt-1">全局设置应用于整个书籍，章节设置仅应用于当前章节</p>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="p-4">
        <Tabs
          :value="currentMainTab"
          class="chapter-settings-main-tabs"
          @update:value="handleMainTabChange"
        >
          <TabList>
            <Tab value="global">全局设置</Tab>
            <Tab value="chapter" :disabled="!chapter">章节设置</Tab>
          </TabList>
          <TabPanels>
            <TabPanel value="global">
              <div class="space-y-4 pt-2">
                <!-- 开关设置（统一分组） -->
                <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                  <div class="px-3 py-2 border-b border-white/10">
                    <div class="text-sm font-medium text-moon-100">开关设置</div>
                    <div class="text-xs text-moon/60 mt-1">以下开关均为书籍级别设置</div>
                  </div>

                  <div class="divide-y divide-white/10">
                    <div class="flex items-start justify-between gap-3 p-3">
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

                    <div class="flex items-start justify-between gap-3 p-3">
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

                    <div class="flex items-start justify-between gap-3 p-3">
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

                    <div class="flex items-start justify-between gap-3 p-3">
                      <div class="flex-1">
                        <label class="text-sm font-medium text-moon-100 block mb-1">
                          跳过 AI 追问（不弹出问答对话框）
                        </label>
                        <small class="text-moon/60 text-xs block">
                          启用时，本书在翻译/润色/校对任务中不会提供 ask_user
                          工具，也不会弹出全屏问答对话框；模型需要自行决策或继续执行。
                        </small>
                      </div>
                      <InputSwitch v-model="skipAskUserEnabled" />
                    </div>

                    <div class="flex items-start justify-between gap-3 p-3">
                      <div class="flex-1">
                        <label class="text-sm font-medium text-moon-100 block mb-1">
                          原文校验（防错位检测）
                        </label>
                        <small class="text-moon/60 text-xs block">
                          启用时，AI
                          提交翻译时必须提供原文前缀锚点（original_text_prefix），系统会校验其与原文是否匹配，防止翻译错位。禁用时可减少
                          AI token 消耗。
                        </small>
                      </div>
                      <InputSwitch v-model="enableOriginalTextValidation" />
                    </div>
                  </div>
                </div>

                <!-- 分块设置 -->
                <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                  <div class="px-3 py-2 border-b border-white/10">
                    <div class="text-sm font-medium text-moon-100">分块设置</div>
                    <div class="text-xs text-moon/60 mt-1">用于翻译相关任务的分块处理</div>
                  </div>
                  <div class="p-3">
                    <label class="text-sm font-medium text-moon-100 block mb-1">
                      翻译任务分块大小（字符数，近似 tokens）
                    </label>
                    <InputNumber
                      v-model="translationChunkSize"
                      :min="MIN_TASK_CHUNK_SIZE"
                      :max="MAX_TASK_CHUNK_SIZE"
                      :step="500"
                      :show-buttons="true"
                      class="w-full"
                      input-class="w-full"
                    />
                    <small class="text-moon/60 text-xs block mt-1">
                      用于翻译、润色、校对任务的分块处理（当前按字符长度切分）。较大的值可以减少分块数量，但可能增加单次处理时间。默认值：{{
                        DEFAULT_TASK_CHUNK_SIZE
                      }}。此设置应用于整个书籍的所有章节。
                    </small>
                  </div>
                </div>
              </div>
            </TabPanel>

            <TabPanel value="chapter">
              <div v-if="chapter">
                <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden mt-2">
                  <div class="px-3 py-2 border-b border-white/10">
                    <div class="text-sm font-medium text-moon-100">章节特殊指令</div>
                    <div class="text-xs text-moon/60 mt-1">
                      仅作用于当前章节；会添加到对应任务的系统提示词中
                    </div>
                  </div>

                  <div class="p-3">
                    <Tabs
                      :value="currentInstructionTab"
                      class="chapter-settings-instruction-tabs"
                      @update:value="handleInstructionTabChange"
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
                            <small class="text-moon/60 text-xs block">
                              这些指令将在执行翻译任务时添加到系统提示词中，仅应用于当前章节
                            </small>
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
                            <small class="text-moon/60 text-xs block">
                              这些指令将在执行润色任务时添加到系统提示词中，仅应用于当前章节
                            </small>
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
                            <small class="text-moon/60 text-xs block">
                              这些指令将在执行校对任务时添加到系统提示词中，仅应用于当前章节
                            </small>
                          </div>
                        </TabPanel>
                      </TabPanels>
                    </Tabs>
                  </div>
                </div>
              </div>
              <div v-else class="pt-4 text-center text-moon/60 text-sm">请先选择一个章节</div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
    <div class="cs-footer p-3 border-t border-white/10 flex justify-end gap-2 flex-shrink-0">
      <Button label="取消" class="p-button-text p-button-sm" @click="handleCancel" />
      <Button label="保存" class="p-button-primary p-button-sm" @click="handleSave" />
    </div>
  </div>
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

.chapter-settings-instruction-tabs :deep([data-pc-name='tablist']),
.chapter-settings-instruction-tabs :deep(.p-tabs-list),
.chapter-settings-instruction-tabs :deep([data-pc-name='tabpanels']),
.chapter-settings-instruction-tabs :deep(.p-tabs-panels),
.chapter-settings-instruction-tabs :deep([data-pc-name='tabpanel']),
.chapter-settings-instruction-tabs :deep(.p-tab-panel) {
  background: transparent !important;
}

.chapter-settings-instruction-tabs :deep(.p-textarea),
.chapter-settings-instruction-tabs :deep(.p-inputtextarea),
.chapter-settings-instruction-tabs :deep([data-pc-name='textarea']),
.chapter-settings-instruction-tabs :deep(textarea) {
  background: var(--white-opacity-5) !important;
  border: 1px solid var(--white-opacity-10) !important;
  color: var(--moon-opacity-90) !important;
}

.chapter-settings-instruction-tabs :deep(.p-textarea:focus),
.chapter-settings-instruction-tabs :deep(.p-inputtextarea:focus),
.chapter-settings-instruction-tabs :deep([data-pc-name='textarea']:focus),
.chapter-settings-instruction-tabs :deep(textarea:focus) {
  border-color: var(--primary-opacity-50) !important;
  box-shadow: 0 0 0 0.2rem rgba(var(--primary-rgb), 0.1) !important;
}

.chapter-settings-instruction-tabs :deep(.p-textarea::placeholder),
.chapter-settings-instruction-tabs :deep(.p-inputtextarea::placeholder),
.chapter-settings-instruction-tabs :deep([data-pc-name='textarea']::placeholder),
.chapter-settings-instruction-tabs :deep(textarea::placeholder) {
  color: var(--moon-opacity-50) !important;
}
</style>
