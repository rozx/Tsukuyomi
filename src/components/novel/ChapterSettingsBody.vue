<script setup lang="ts">
/**
 * 章节/书籍设置面板的内容部分。桌面 Popover 和手机 MobileBottomSheet 共享同一份。
 * 父面板监听 `save` / `close` 事件来关闭 shell 并上抛保存数据。
 *
 * showGlobalTab=false（桌面/平板）：纯章节级指令设置，payload 不含书籍级字段；
 * showGlobalTab=true（手机）：保留「全局设置+章节设置」双 tab，全局 tab 复用
 * BookTranslationSettingsForm 共享表单（含模型覆盖）。
 */
import { computed, ref, watch } from 'vue';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { useUiStore } from 'src/stores/ui';
import BookTranslationSettingsForm from './BookTranslationSettingsForm.vue';
import type { Novel, Chapter } from 'src/models/novel';
import type { ChapterSettingsFormData } from 'src/composables/book-details/chapter-settings-update';

const props = defineProps<{
  book: Novel | null;
  chapter: Chapter | null;
  showGlobalTab: boolean;
}>();

const emit = defineEmits<{
  (e: 'save', data: ChapterSettingsFormData): void;
  (e: 'close'): void;
}>();

const uiStore = useUiStore();
const isPhone = computed(() => uiStore.deviceType === 'phone');

// 手机抽屉里滚动由 MobileBottomSheet 的 mbs-body 承担，body 必须走自然流式布局；
// h-full/overflow-hidden 在滚动容器内会把高度钉死在可视高度，导致内容被裁切。
// 桌面 Popover（固定 600px 壳）则保持内部滚动 + 底部按钮常驻。
const rootClass = computed(() =>
  isPhone.value ? 'flex flex-col' : 'flex flex-col h-full overflow-hidden',
);
const contentClass = computed(() => (isPhone.value ? '' : 'flex-1 min-h-0 overflow-y-auto'));

const mainTab = ref<string>(props.showGlobalTab ? 'global' : 'chapter');
const instructionTab = ref<string>('translation');
const currentMainTab = computed(() => mainTab.value || 'global');
const currentInstructionTab = computed(() => instructionTab.value || 'translation');

const globalFormRef = ref<InstanceType<typeof BookTranslationSettingsForm> | null>(null);

const translationInstructions = ref('');
const polishInstructions = ref('');
const proofreadingInstructions = ref('');

// 从章节同步三类指令文本；chapter 为 null 时清空
const applyChapterInstructions = (chapter: Chapter | null) => {
  translationInstructions.value = chapter?.translationInstructions || '';
  polishInstructions.value = chapter?.polishInstructions || '';
  proofreadingInstructions.value = chapter?.proofreadingInstructions || '';
};

watch(
  () => [props.book, props.chapter],
  () => {
    if (props.chapter) {
      applyChapterInstructions(props.chapter);
    } else {
      applyChapterInstructions(null);
      if (props.showGlobalTab) mainTab.value = 'global';
    }
    instructionTab.value = 'translation';
  },
  { immediate: true },
);

const handleSave = () => {
  // 书籍级字段只在有全局 tab 时携带；桌面弹窗 payload 仅含章节指令，
  // 保存链路按字段存在性更新，不会触碰书籍级设置
  const bookLevelPayload = props.showGlobalTab
    ? (globalFormRef.value?.buildBookLevelPayload() ?? {})
    : {};
  emit('save', {
    ...bookLevelPayload,
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
  <div class="chapter-settings-body" :class="rootClass">
    <div v-if="!isPhone" class="cs-header p-3 border-b border-white/10 flex-shrink-0">
      <h4 class="font-medium text-moon-100">{{ showGlobalTab ? '翻译设置' : '章节设置' }}</h4>
      <p class="text-xs text-moon/60 mt-1">
        {{
          showGlobalTab
            ? '全局设置应用于整个书籍，章节设置仅应用于当前章节'
            : '章节特殊指令仅应用于当前章节；书籍级设置请在侧栏「翻译设置」中配置'
        }}
      </p>
    </div>
    <div :class="contentClass">
      <div class="p-4">
        <!-- showGlobalTab=false 时隐藏主 TabList、固定停在章节页签，复用同一份章节指令模板 -->
        <Tabs
          :value="currentMainTab"
          class="chapter-settings-main-tabs"
          @update:value="handleMainTabChange"
        >
          <TabList v-if="showGlobalTab">
            <Tab value="global">全局设置</Tab>
            <Tab value="chapter" :disabled="!chapter">章节设置</Tab>
          </TabList>
          <TabPanels>
            <TabPanel v-if="showGlobalTab" value="global">
              <div class="pt-2">
                <BookTranslationSettingsForm ref="globalFormRef" :book="book" />
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
