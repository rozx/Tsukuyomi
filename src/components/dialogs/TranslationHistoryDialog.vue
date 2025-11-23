<script setup lang="ts">
import { computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import type { Paragraph, Translation } from 'src/types/novel';
import { useAIModelsStore } from 'src/stores/ai-models';

const props = defineProps<{
  visible: boolean;
  paragraph: Paragraph | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'select-translation', translationId: string): void;
}>();

const aiModelsStore = useAIModelsStore();

// 获取可用的翻译历史（最多5个，按时间倒序，最新的在前）
const translationHistory = computed(() => {
  if (!props.paragraph?.translations || props.paragraph.translations.length === 0) {
    return [];
  }
  
  // 按数组顺序，最新的在最后，反转后取前5个
  const translations = [...props.paragraph.translations].reverse();
  
  // 返回最多5个
  return translations.slice(0, 5);
});

// 获取模型名称
const getModelName = (modelId: string): string => {
  const model = aiModelsStore.getModelById(modelId);
  return model?.name || '未知模型';
};

// 处理选择翻译
const handleSelectTranslation = (translationId: string) => {
  emit('select-translation', translationId);
  emit('update:visible', false);
};

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '32rem', maxWidth: '90vw' }"
    :closable="true"
    :draggable="false"
    header="翻译历史"
    @update:visible="handleClose"
  >
    <div v-if="!paragraph || translationHistory.length === 0" class="empty-state">
      <i class="pi pi-history empty-icon" />
      <p class="empty-text">暂无翻译历史</p>
    </div>

    <div v-else class="translation-history-content">
      <div class="translation-history-list">
        <div
          v-for="translation in translationHistory"
          :key="translation.id"
          class="translation-history-item"
          :class="{ 'is-selected': translation.id === paragraph.selectedTranslationId }"
          @click="handleSelectTranslation(translation.id)"
        >
          <div class="translation-history-header">
            <div class="translation-history-info">
              <span class="translation-history-model">{{ getModelName(translation.aiModelId) }}</span>
              <span class="translation-history-id">ID: {{ translation.id }}</span>
            </div>
            <i
              v-if="translation.id === paragraph.selectedTranslationId"
              class="pi pi-check translation-history-check"
            />
          </div>
          <div class="translation-history-text">
            {{ translation.translation }}
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        label="关闭"
        icon="pi pi-times"
        text
        severity="secondary"
        @click="handleClose"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  gap: 1rem;
}

.empty-icon {
  font-size: 3rem;
  color: var(--moon-opacity-40);
}

.empty-text {
  font-size: 1rem;
  color: var(--moon-opacity-60);
  margin: 0;
}

.translation-history-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 60vh;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.translation-history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.translation-history-item {
  padding: 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--white-opacity-20);
  background: var(--white-opacity-5);
}

.translation-history-item:hover {
  background-color: var(--white-opacity-10);
  border-color: var(--primary-opacity-30);
  transform: translateY(-1px);
}

.translation-history-item.is-selected {
  background-color: var(--primary-opacity-20);
  border-color: var(--primary-opacity-50);
}

.translation-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.translation-history-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.translation-history-model {
  font-size: 0.875rem;
  color: var(--moon-opacity-90);
  font-weight: 600;
}

.translation-history-id {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
  font-family: monospace;
}

.translation-history-check {
  font-size: 1rem;
  color: var(--primary-opacity-100);
}

.translation-history-text {
  font-size: 0.9375rem;
  color: var(--moon-opacity-95);
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>

