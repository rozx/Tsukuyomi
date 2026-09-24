<script setup lang="ts">
/** 按需抓取并显示一章的来源正文（会话内缓存，应用时不会重复请求）。 */
import { onMounted, ref } from 'vue';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import { getErrorMessage } from 'src/utils/error-message';

const props = defineProps<{ url: string }>();
const { preview } = injectBookSync();

const paragraphs = ref<string[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    paragraphs.value = await preview(props.url);
  } catch (reason) {
    error.value = getErrorMessage(reason).replace(/^[A-Z_]+:\s*/, '');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="cpt">
    <p v-if="loading" class="cpt-muted"><i class="pi pi-spin pi-spinner" /> 正在获取正文…</p>
    <p v-else-if="error" class="cpt-error">{{ error }}</p>
    <template v-else>
      <p v-for="(text, index) in paragraphs" :key="index" class="cpt-text">{{ text }}</p>
    </template>
  </div>
</template>

<style scoped>
.cpt {
  max-height: 18rem;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.cpt-text {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.85);
  white-space: pre-wrap;
}

.cpt-muted {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.5);
}

.cpt-error {
  margin: 0;
  font-size: 0.74rem;
  color: rgb(252, 165, 165);
}
</style>
