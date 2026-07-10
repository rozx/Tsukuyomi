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
import type { ChapterSettingsFormData } from 'src/composables/book-details/chapter-settings-update';
import {
  DEFAULT_TASK_CHUNK_SIZE,
  MIN_TASK_CHUNK_SIZE,
  MAX_TASK_CHUNK_SIZE,
} from 'src/services/ai/tasks/utils/chunk-formatter';

const props = defineProps<{
  book: Novel | null;
}>();

const aiModelsStore = useAIModelsStore();

// 表单状态从书籍同步（bookToFormState 承载字段映射与默认值语义）
const state = ref(bookToFormState(props.book));

const resetFromBook = () => {
  state.value = bookToFormState(props.book);
};

watch(() => props.book, resetFromBook);

/** 书籍级 payload（不含章节指令字段） */
const buildBookLevelPayload = (): ChapterSettingsFormData => formStateToPayload(state.value);

defineExpose({ buildBookLevelPayload, resetFromBook });

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
    { label: `跟随全局默认（当前：${globalDefault?.name ?? '未配置'}）`, value: FOLLOW_GLOBAL },
    ...aiModelsStore.enabledModels.map((m) => ({ label: m.name, value: m.id })),
  ];
  if (currentOverride && !aiModelsStore.enabledModels.some((m) => m.id === currentOverride)) {
    options.push({ label: `已失效的模型（${currentOverride}）`, value: currentOverride });
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
  <div class="space-y-4">
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
          <InputSwitch v-model="state.filterIndents" />
        </div>

        <div class="flex items-start justify-between gap-3 p-3">
          <div class="flex-1">
            <label class="text-sm font-medium text-moon-100 block mb-1"> 显示时规范化符号 </label>
            <small class="text-moon/60 text-xs block">
              启用时，仅在显示和导出时规范化译文中的引号、标点、空格等；不会改写或保存译文内容。
            </small>
          </div>
          <InputSwitch v-model="state.normalizeSymbolsOnDisplay" />
        </div>

        <div class="flex items-start justify-between gap-3 p-3">
          <div class="flex-1">
            <label class="text-sm font-medium text-moon-100 block mb-1"> 显示时规范化标题 </label>
            <small class="text-moon/60 text-xs block">
              启用时，仅在显示和导出时规范化章节标题（如：将全角数字和汉字之间的半角空格转换为全角空格）；不会改写或保存标题内容。
            </small>
          </div>
          <InputSwitch v-model="state.normalizeTitleOnDisplay" />
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
          <InputSwitch v-model="state.skipAskUser" />
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
          <InputSwitch v-model="state.enableOriginalTextValidation" />
        </div>
      </div>
    </div>

    <!-- 模型覆盖 -->
    <div class="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      <div class="px-3 py-2 border-b border-white/10">
        <div class="text-sm font-medium text-moon-100">模型覆盖</div>
        <div class="text-xs text-moon/60 mt-1">
          为本书单独指定任务模型；未设置时跟随全局默认（AI 设置页配置）
        </div>
      </div>
      <div class="divide-y divide-white/10">
        <div class="p-3">
          <label class="text-sm font-medium text-moon-100 block mb-1">翻译模型</label>
          <Select
            v-model="translationModelSelection"
            :options="translationModelOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
          <small class="text-moon/60 text-xs block mt-1">
            用于本书的整章翻译、段落翻译任务
          </small>
        </div>
        <div class="p-3">
          <label class="text-sm font-medium text-moon-100 block mb-1">校对 / 润色模型</label>
          <Select
            v-model="proofreadingModelSelection"
            :options="proofreadingModelOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
          <small class="text-moon/60 text-xs block mt-1">
            用于本书的校对与润色任务（两者共用一个模型）
          </small>
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
          v-model="state.translationChunkSize"
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
</template>
