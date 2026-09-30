<script setup lang="ts">
/** 检查或应用时失败的章节：显示原因，可逐章重试（只重新抓取并应用该章）。 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import { importNoticeText } from 'src/services/import/import-error';
import { resolveAppLocale } from 'src/models/locale';

const { changeset, working, retry } = injectBookSync();
const { t, locale } = useI18n();
// 自有失败按界面语言重投影，外部诊断保持原文；服务端失败信息带 `CODE: ` 前缀，只展示说明部分
const failures = computed(
  () =>
    changeset.value?.failed
      .filter((entry) => entry.url)
      .map((entry) => ({
        ...entry,
        reason: importNoticeText(entry, resolveAppLocale(locale.value)).replace(/^[A-Z_]+:\s*/, ''),
      })) ?? [],
);
</script>

<template>
  <section v-if="failures.length" class="ipl-card fl">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-times-circle" aria-hidden="true" />{{ t('bookUi.sync.failedTitle') }}
        <span class="ipl-count">{{ failures.length }}</span>
      </h3>
    </div>
    <ul class="bsw-list bsw-scroll">
      <li v-for="failure in failures" :key="failure.url" class="bsw-row">
        <span class="fl-body">
          <a :href="failure.url" target="_blank" rel="noopener noreferrer" class="fl-url">
            {{ failure.url }}
          </a>
          <span class="fl-reason">{{ failure.reason }}</span>
        </span>
        <Button
          :label="t('bookUi.sync.retry')"
          icon="pi pi-refresh"
          size="small"
          text
          :disabled="working"
          @click="retry(failure.url)"
        />
      </li>
    </ul>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped src="../book-sync.css"></style>
<style scoped>
.fl {
  border-color: rgba(239, 68, 68, 0.22);
}

.fl-body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.fl-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  color: rgba(226, 232, 240, 0.85);
}

.fl-reason {
  font-size: 0.7rem;
  color: rgb(252, 165, 165);
}
</style>
