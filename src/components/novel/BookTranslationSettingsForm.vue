<script setup lang="ts">
/**
 * 书籍级翻译设置共享表单：5 个开关 + 分块大小 + 模型覆盖（翻译 / 校对·润色）。
 * 被桌面路由面板（BookTranslationSettingsPanel）与手机底部抽屉全局 tab
 * （ChapterSettingsBody showGlobalTab）共用。
 *
 * 表单不直接写库：内部状态从 book 同步，父组件在自己的「保存」时机调用
 * buildBookLevelPayload() 取书籍级 payload 落库。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { languageOptions } from 'src/i18n/translate';
import { resolveAppLocale } from 'src/models/locale';
import InputSwitch from 'primevue/inputswitch';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import { useAIModelsStore } from 'src/stores/ai-models';
import type { Novel } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import {
  bookToFormState,
  formStateToPayload,
} from 'src/composables/book-details/chapter-settings-update';
import type {
  BookTranslationSettingsFormHandle,
  ChapterSettingsFormData,
} from 'src/composables/book-details/chapter-settings-update';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  MIN_TASK_CHUNK_SIZE,
  MAX_TASK_CHUNK_SIZE,
} from 'src/services/ai/tasks/utils/chunk-formatter';

const props = defineProps<{
  book: Novel | null;
}>();

const aiModelsStore = useAIModelsStore();
const { t, locale } = useI18n();
const languages = computed(() => languageOptions(resolveAppLocale(locale.value, [])));

// 表单状态从书籍同步（bookToFormState 承载字段映射与默认值语义）
const state = ref(bookToFormState(props.book));

const resetFromBook = () => {
  state.value = bookToFormState(props.book);
};

watch(() => props.book, resetFromBook);

/** 书籍级 payload（不含章节指令字段） */
const buildBookLevelPayload = (): ChapterSettingsFormData => formStateToPayload(state.value);

defineExpose<BookTranslationSettingsFormHandle>({ buildBookLevelPayload, resetFromBook });

type ModelOption = { label: string; value: string };

// PrimeVue Select 把 null modelValue 当「未选择」处理，无法命中 value 为 null 的选项，
// 因此「跟随全局默认」在下拉内用哨兵值表示，payload 边界再映射回 null
const FOLLOW_GLOBAL = '__follow_global__';

// 「跟随全局默认」+ 已启用模型；覆盖指向失效模型时追加失效占位项（不改数据）
const buildModelOptions = (
  task: keyof AIModel['isDefault'],
  currentOverride: string | null,
): ModelOption[] => {
  const globalDefault = aiModelsStore.getDefaultModelForTask(task);
  const options: ModelOption[] = [
    {
      label: t('translationUi.followGlobal', {
        model: globalDefault?.name ?? t('translationUi.notConfigured'),
      }),
      value: FOLLOW_GLOBAL,
    },
    ...aiModelsStore.enabledModels.map((m) => ({ label: m.name, value: m.id })),
  ];
  if (currentOverride && !aiModelsStore.enabledModels.some((m) => m.id === currentOverride)) {
    options.push({
      label: t('translationUi.invalidModel', { id: currentOverride }),
      value: currentOverride,
    });
  }
  return options;
};

const translationModelOptions = computed(() =>
  buildModelOptions('translation', state.value.translationModelOverride),
);
const proofreadingModelOptions = computed(() =>
  buildModelOptions('proofreading', state.value.proofreadingModelOverride),
);

const translationModelSelection = computed({
  get: () => state.value.translationModelOverride ?? FOLLOW_GLOBAL,
  set: (value: string) => {
    state.value.translationModelOverride = value === FOLLOW_GLOBAL ? null : value;
  },
});
const proofreadingModelSelection = computed({
  get: () => state.value.proofreadingModelOverride ?? FOLLOW_GLOBAL,
  set: (value: string) => {
    state.value.proofreadingModelOverride = value === FOLLOW_GLOBAL ? null : value;
  },
});
</script>

<template>
  <!-- 宽屏两列（左列开关，右列模型覆盖+分块），窄容器（手机抽屉）退化为单列 -->
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
    <div class="xl:col-span-2 rounded-lg border border-white/10 p-3 space-y-2">
      <label for="book-target-language" class="block text-sm font-medium">{{
        t('books.targetLanguage')
      }}</label>
      <Select
        input-id="book-target-language"
        v-model="state.targetLanguage"
        :options="languages"
        option-label="label"
        option-value="value"
        class="w-full max-w-md"
      />
      <p class="text-xs text-moon/60">{{ t('books.targetLanguageHint') }}</p>
    </div>
    <div class="space-y-4">
      <!-- 开关设置（统一分组） -->
      <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
        <div class="px-3 py-2 border-b border-white/10">
          <div class="text-sm font-medium text-moon-100">{{ t('translationUi.switches') }}</div>
          <div class="text-xs text-moon/60 mt-1">{{ t('translationUi.switchesHint') }}</div>
        </div>

        <div class="divide-y divide-white/10">
          <div class="flex items-start justify-between gap-3 p-3">
            <div class="flex-1">
              <label class="text-sm font-medium text-moon-100 block mb-1">{{
                t('translationUi.filterIndents')
              }}</label>
              <small class="text-moon/60 text-xs block">{{
                t('translationUi.filterIndentsHint')
              }}</small>
            </div>
            <InputSwitch
              v-model="state.filterIndents"
              :aria-label="t('translationUi.filterIndents')"
            />
          </div>

          <div class="flex items-start justify-between gap-3 p-3">
            <div class="flex-1">
              <label class="text-sm font-medium text-moon-100 block mb-1">{{
                t('translationUi.normalizeSymbols')
              }}</label>
              <small class="text-moon/60 text-xs block">{{
                t('translationUi.normalizeSymbolsHint')
              }}</small>
            </div>
            <InputSwitch
              v-model="state.normalizeSymbolsOnDisplay"
              :aria-label="t('translationUi.normalizeSymbols')"
            />
          </div>

          <div class="flex items-start justify-between gap-3 p-3">
            <div class="flex-1">
              <label class="text-sm font-medium text-moon-100 block mb-1">{{
                t('translationUi.normalizeTitles')
              }}</label>
              <small class="text-moon/60 text-xs block">{{
                t('translationUi.normalizeTitlesHint')
              }}</small>
            </div>
            <InputSwitch
              v-model="state.normalizeTitleOnDisplay"
              :aria-label="t('translationUi.normalizeTitles')"
            />
          </div>

          <div class="flex items-start justify-between gap-3 p-3">
            <div class="flex-1">
              <label class="text-sm font-medium text-moon-100 block mb-1">{{
                t('translationUi.skipQuestions')
              }}</label>
              <small class="text-moon/60 text-xs block">
                {{ t('translationUi.skipQuestionsHint') }}
              </small>
            </div>
            <InputSwitch
              v-model="state.skipAskUser"
              :aria-label="t('translationUi.skipQuestions')"
            />
          </div>

          <div class="flex items-start justify-between gap-3 p-3">
            <div class="flex-1">
              <label class="text-sm font-medium text-moon-100 block mb-1">{{
                t('translationUi.validateSource')
              }}</label>
              <small class="text-moon/60 text-xs block">
                {{ t('translationUi.validateSourceHint') }}
              </small>
            </div>
            <InputSwitch
              v-model="state.enableOriginalTextValidation"
              :aria-label="t('translationUi.validateSource')"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <!-- 模型覆盖 -->
      <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
        <div class="px-3 py-2 border-b border-white/10">
          <div class="text-sm font-medium text-moon-100">
            {{ t('translationUi.modelOverrides') }}
          </div>
          <div class="text-xs text-moon/60 mt-1">{{ t('translationUi.modelOverridesHint') }}</div>
        </div>
        <div class="divide-y divide-white/10">
          <div class="p-3">
            <label class="text-sm font-medium text-moon-100 block mb-1">{{
              t('translationUi.translationModel')
            }}</label>
            <Select
              v-model="translationModelSelection"
              :options="translationModelOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
            <small class="text-moon/60 text-xs block mt-1">{{
              t('translationUi.translationModelHint')
            }}</small>
          </div>
          <div class="p-3">
            <label class="text-sm font-medium text-moon-100 block mb-1">{{
              t('translationUi.proofreadModel')
            }}</label>
            <Select
              v-model="proofreadingModelSelection"
              :options="proofreadingModelOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
            <small class="text-moon/60 text-xs block mt-1">{{
              t('translationUi.proofreadModelHint')
            }}</small>
          </div>
        </div>
      </div>

      <!-- 分块设置 -->
      <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
        <div class="px-3 py-2 border-b border-white/10">
          <div class="text-sm font-medium text-moon-100">{{ t('translationUi.chunks') }}</div>
          <div class="text-xs text-moon/60 mt-1">{{ t('translationUi.chunksHint') }}</div>
        </div>
        <div class="p-3">
          <label class="text-sm font-medium text-moon-100 block mb-1">{{
            t('translationUi.chunkSize')
          }}</label>
          <InputNumber
            v-model="state.translationChunkSize"
            :aria-label="t('translationUi.chunkSize')"
            :min="MIN_TASK_CHUNK_SIZE"
            :max="MAX_TASK_CHUNK_SIZE"
            :step="500"
            :show-buttons="true"
            class="w-full"
            input-class="w-full"
          />
          <small class="text-moon/60 text-xs block mt-1">
            {{ t('translationUi.chunkSizeHint', { size: DEFAULT_TASK_CHUNK_SIZE }) }}
          </small>
        </div>
      </div>
    </div>
  </div>
</template>
