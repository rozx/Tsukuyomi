<script setup lang="ts">
/** 按需抓取并显示一章的来源正文（会话内缓存，应用时不会重复请求）。 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { resolveAppLocale } from 'src/models/locale';

const props = defineProps<{ url: string }>();
const { preview } = injectBookSync();

const { t, locale } = useI18n();
const paragraphs = ref<string[]>([]);
const loading = ref(true);
const failure = ref<unknown>(null);
// 自有错误按界面语言渲染，外部诊断保留原文；去掉 `CODE: ` 前缀
const error = computed(() =>
  failure.value === null
    ? ''
    : localizedErrorMessage(
        failure.value,
        resolveAppLocale(locale.value),
        'bookUi.sync.unknownError',
      ).replace(/^[A-Z_]+:\s*/, ''),
);

onMounted(async () => {
  try {
    paragraphs.value = await preview(props.url);
  } catch (reason) {
    failure.value = reason;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="cpt">
    <p v-if="loading" class="cpt-muted">
      <i class="pi pi-spin pi-spinner" /> {{ t('bookUi.sync.loadingPreview') }}
    </p>
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
