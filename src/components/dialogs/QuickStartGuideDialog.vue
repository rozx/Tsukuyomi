<template>
  <Dialog
    :visible="visible"
    modal
    header="快速开始指南"
    :style="{ width: 'min(960px, 92vw)', maxHeight: '90vh' }"
    :draggable="false"
    :resizable="false"
    @update:visible="handleVisibleChange"
  >
    <div class="quick-start-content">
      <div v-if="loading" class="state-box">
        <i class="pi pi-spin pi-spinner text-primary text-xl"></i>
        <span class="text-moon/80">正在加载快速开始指南...</span>
      </div>
      <div v-else-if="error" class="state-box state-error">
        <i class="pi pi-exclamation-triangle text-red-400 text-xl"></i>
        <span>{{ error }}</span>
      </div>
      <article v-else class="doc-content" v-html="contentHtml"></article>
    </div>

    <template #footer>
      <Button
        label="我知道了，不再提示"
        icon="pi pi-check"
        @click="handleDismiss"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'dismiss'): void;
}>();

const loading = ref(false);
const error = ref('');
const contentHtml = ref('');
const hasLoadedContent = ref(false);

const loadGuideContent = async (): Promise<void> => {
  if (hasLoadedContent.value || loading.value) {
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/help/front-page.md');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const markdown = await response.text();
    const renderedHtml = await marked.parse(markdown);
    contentHtml.value = DOMPurify.sanitize(renderedHtml);
    hasLoadedContent.value = true;
  } catch (loadError) {
    console.error('Failed to load quick start guide:', loadError);
    error.value = '无法加载快速开始指南，请稍后重试。';
  } finally {
    loading.value = false;
  }
};

const handleDismiss = (): void => {
  emit('dismiss');
};

const handleVisibleChange = (nextVisible: boolean): void => {
  if (!nextVisible) {
    emit('dismiss');
  }
};

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      void loadGuideContent();
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.quick-start-content {
  max-height: calc(90vh - 170px);
  overflow-y: auto;
  padding-right: 0.25rem;
}

.state-box {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.state-error {
  color: rgb(252 165 165);
}

.doc-content {
  color: rgb(var(--moon-rgb) / 0.9);
  line-height: 1.7;
}

.doc-content :deep(h1),
.doc-content :deep(h2),
.doc-content :deep(h3),
.doc-content :deep(h4) {
  color: rgb(var(--moon-100-rgb));
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  line-height: 1.35;
}

.doc-content :deep(h1) {
  font-size: 1.6rem;
  margin-top: 0;
}

.doc-content :deep(h2) {
  font-size: 1.25rem;
}

.doc-content :deep(p) {
  margin-bottom: 0.9rem;
}

.doc-content :deep(ul),
.doc-content :deep(ol) {
  padding-left: 1.25rem;
  margin-bottom: 0.9rem;
}

.doc-content :deep(code) {
  background: rgb(255 255 255 / 0.08);
  border-radius: 0.25rem;
  padding: 0.1rem 0.35rem;
}

.doc-content :deep(a) {
  color: rgb(var(--primary-rgb));
}
</style>
