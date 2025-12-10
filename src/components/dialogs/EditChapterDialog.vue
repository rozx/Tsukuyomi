<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';

interface VolumeOption {
  label: string;
  value: string;
}

const props = defineProps<{
  visible: boolean;
  title: string;
  translation: string;
  targetVolumeId: string | null;
  volumeOptions: VolumeOption[];
  loading?: boolean;
  translationInstructions?: string;
  polishInstructions?: string;
  proofreadingInstructions?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (
    e: 'save',
    data: {
      title: string;
      translation: string;
      targetVolumeId: string;
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ): void;
}>();

const chapterTitle = ref('');
const chapterTranslation = ref('');
const selectedVolumeId = ref<string | null>(null);
const chapterTranslationInstructions = ref('');
const chapterPolishInstructions = ref('');
const chapterProofreadingInstructions = ref('');

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      chapterTitle.value = props.title;
      chapterTranslation.value = props.translation;
      selectedVolumeId.value = props.targetVolumeId;
      chapterTranslationInstructions.value = props.translationInstructions || '';
      chapterPolishInstructions.value = props.polishInstructions || '';
      chapterProofreadingInstructions.value = props.proofreadingInstructions || '';
    }
  },
);

watch(
  () => props.title,
  (newVal) => {
    if (props.visible) {
      chapterTitle.value = newVal;
    }
  },
);

watch(
  () => props.translation,
  (newVal) => {
    if (props.visible) {
      chapterTranslation.value = newVal;
    }
  },
);

watch(
  () => props.targetVolumeId,
  (newVal) => {
    if (props.visible) {
      selectedVolumeId.value = newVal;
    }
  },
);

const handleSave = () => {
  if (chapterTitle.value.trim() && selectedVolumeId.value) {
    const data: {
      title: string;
      translation: string;
      targetVolumeId: string;
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    } = {
      title: chapterTitle.value.trim(),
      translation: chapterTranslation.value.trim(),
      targetVolumeId: selectedVolumeId.value,
    };

    const trimmedTranslation = chapterTranslationInstructions.value.trim();
    if (trimmedTranslation) {
      data.translationInstructions = trimmedTranslation;
    }

    const trimmedPolish = chapterPolishInstructions.value.trim();
    if (trimmedPolish) {
      data.polishInstructions = trimmedPolish;
    }

    const trimmedProofreading = chapterProofreadingInstructions.value.trim();
    if (trimmedProofreading) {
      data.proofreadingInstructions = trimmedProofreading;
    }

    emit('save', data);
  }
};

const handleCancel = () => {
  emit('update:visible', false);
};

const handleTranslationApplied = (value: string) => {
  chapterTranslation.value = value;
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="编辑章节"
    :style="{ width: '30rem' }"
    :draggable="false"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label for="edit-chapter-title" class="block text-sm font-medium text-moon/90"
          >章节标题（原文）*</label
        >
        <TranslatableInput
          id="edit-chapter-title"
          v-model="chapterTitle"
          placeholder="输入章节标题..."
          type="input"
          :apply-translation-to-input="false"
          @translation-applied="handleTranslationApplied"
          @keyup.enter="handleSave"
        />
      </div>
      <div class="space-y-2">
        <label for="edit-chapter-translation" class="block text-sm font-medium text-moon/90"
          >翻译</label
        >
        <InputText
          id="edit-chapter-translation"
          v-model="chapterTranslation"
          placeholder="输入翻译（可选）"
          class="w-full"
          @keyup.enter="handleSave"
        />
      </div>
      <div class="space-y-2" v-if="volumeOptions.length > 0">
        <label for="edit-chapter-volume" class="block text-sm font-medium text-moon/90"
          >所属卷</label
        >
        <Select
          id="edit-chapter-volume"
          v-model="selectedVolumeId"
          :options="volumeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="选择卷"
          class="w-full"
        />
      </div>

      <!-- 特殊指令 -->
      <div class="space-y-4 pt-2 border-t border-white/10">
        <label class="block text-sm font-medium text-moon/90">特殊指令（章节级别）</label>
        <small class="text-moon/60 text-xs block mb-2"
          >这些指令将覆盖书籍级别的指令，仅应用于当前章节。</small
        >

        <!-- 翻译指令 -->
        <div class="space-y-2">
          <label
            for="edit-chapter-translation-instructions"
            class="block text-sm font-medium text-moon/80"
            >翻译指令</label
          >
          <Textarea
            id="edit-chapter-translation-instructions"
            v-model="chapterTranslationInstructions"
            placeholder="输入翻译任务的特殊指令（可选）"
            :rows="3"
            :auto-resize="true"
            class="w-full"
          />
          <small class="text-moon/60 text-xs block"
            >这些指令将在执行翻译任务时添加到系统提示词中</small
          >
        </div>

        <!-- 润色指令 -->
        <div class="space-y-2">
          <label
            for="edit-chapter-polish-instructions"
            class="block text-sm font-medium text-moon/80"
            >润色指令</label
          >
          <Textarea
            id="edit-chapter-polish-instructions"
            v-model="chapterPolishInstructions"
            placeholder="输入润色任务的特殊指令（可选）"
            :rows="3"
            :auto-resize="true"
            class="w-full"
          />
          <small class="text-moon/60 text-xs block"
            >这些指令将在执行润色任务时添加到系统提示词中</small
          >
        </div>

        <!-- 校对指令 -->
        <div class="space-y-2">
          <label
            for="edit-chapter-proofreading-instructions"
            class="block text-sm font-medium text-moon/80"
            >校对指令</label
          >
          <Textarea
            id="edit-chapter-proofreading-instructions"
            v-model="chapterProofreadingInstructions"
            placeholder="输入校对任务的特殊指令（可选）"
            :rows="3"
            :auto-resize="true"
            class="w-full"
          />
          <small class="text-moon/60 text-xs block"
            >这些指令将在执行校对任务时添加到系统提示词中</small
          >
        </div>
      </div>
    </div>
    <template #footer>
      <Button label="取消" class="p-button-text" :disabled="loading" @click="handleCancel" />
      <Button
        label="保存"
        :loading="loading"
        :disabled="!chapterTitle.trim() || !selectedVolumeId || loading"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>
