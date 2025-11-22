<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import AppMessage from 'src/components/common/AppMessage.vue';
import TranslatableInput from 'src/components/translation/TranslatableInput.vue';
import type { Terminology } from 'src/types/novel';

const props = defineProps<{
  visible: boolean;
  term?: Terminology | null; // If provided, we are in edit mode
  mode: 'add' | 'edit';
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'save', data: { name: string; translation: string; description: string }): void;
}>();

const formData = ref({
  name: '',
  description: '',
  translation: '',
});

// Reset form when dialog opens or term changes
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      if (props.mode === 'edit' && props.term) {
        formData.value = {
          name: props.term.name,
          description: props.term.description || '',
          translation: props.term.translation.translation,
        };
      } else {
        formData.value = {
          name: '',
          description: '',
          translation: '',
        };
      }
    }
  },
);

// Also watch term prop in case it changes while dialog is open (less likely but good practice)
watch(
  () => props.term,
  (newTerm) => {
    if (props.visible && props.mode === 'edit' && newTerm) {
      formData.value = {
        name: newTerm.name,
        description: newTerm.description || '',
        translation: newTerm.translation.translation,
      };
    }
  },
);

const handleNameUpdate = (value: string) => {
  formData.value.name = value;
};

const handleTranslationApplied = (result: string) => {
  formData.value.translation = result;
};

const handleSave = () => {
  // 验证必填字段
  const trimmedName = formData.value.name.trim();
  if (!trimmedName) {
    // 名称不能为空，但这里不显示错误，由父组件处理
    return;
  }

  emit('save', {
    name: trimmedName,
    translation: formData.value.translation.trim(),
    description: formData.value.description.trim(),
  });
};

const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    :header="mode === 'add' ? '添加术语' : '编辑术语'"
    :modal="true"
    :style="{ width: '30rem' }"
    :closable="true"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <label class="text-sm text-moon/80">术语名称 *</label>
        <TranslatableInput
          v-model="formData.name"
          placeholder="输入术语名称"
          :apply-translation-to-input="false"
          @update:model-value="handleNameUpdate"
          @translation-applied="handleTranslationApplied"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon/80">翻译</label>
        <InputText v-model="formData.translation" placeholder="输入翻译" class="w-full" />
        <AppMessage
          severity="info"
          message="留空则让翻译 AI 在翻译章节时自动翻译此术语"
          :closable="false"
        />
      </div>

      <div class="space-y-2">
        <label class="text-sm text-moon/80">描述</label>
        <Textarea
          v-model="formData.description"
          placeholder="输入描述（可选）"
          :rows="3"
          class="w-full"
        />
        <AppMessage
          severity="info"
          message="留空则让翻译 AI 在翻译章节时自动更新描述内容"
          :closable="false"
        />
      </div>
    </div>

    <template #footer>
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text"
        :disabled="loading"
        @click="handleClose"
      />
      <Button
        label="保存"
        icon="pi pi-check"
        class="p-button-primary"
        :loading="loading"
        :disabled="loading || !formData.name.trim()"
        @click="handleSave"
      />
    </template>
  </Dialog>
</template>
