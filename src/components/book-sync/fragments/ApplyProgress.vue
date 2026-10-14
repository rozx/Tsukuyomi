<script setup lang="ts">
/**
 * 应用进行中的进度（确认弹窗内）：抓取第几章、是否在等待 Firecrawl 限速、
 * 其中多少章经 Firecrawl 抓取；全部抓完后进入写入阶段。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ProgressBar from 'primevue/progressbar';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { applyProgress } = injectBookSync();
const { t } = useI18n();

/** 抓取完所有章节后进入写入阶段（时间较短，进度条改为不确定） */
const writing = computed(
  () => !!applyProgress.value && applyProgress.value.completed >= applyProgress.value.total,
);
const percent = computed(() =>
  applyProgress.value?.total
    ? Math.round((applyProgress.value.completed / applyProgress.value.total) * 100)
    : 0,
);
</script>

<template>
  <div
    v-if="applyProgress"
    class="ac-progress"
    role="status"
    aria-live="polite"
    data-testid="bsw-apply-progress"
  >
    <ProgressBar
      :value="percent"
      :mode="writing ? 'indeterminate' : 'determinate'"
      :show-value="false"
      class="ac-bar"
    />
    <p class="ac-progress-text">
      <template v-if="writing">{{ t('bookUi.sync.applyWriting') }}</template>
      <template v-else>
        {{
          t('bookUi.sync.applyFetching', {
            completed: applyProgress.completed,
            total: applyProgress.total,
          })
        }}
        <template v-if="applyProgress.waitSeconds > 0">
          {{ t('bookUi.sync.waitFirecrawl', { seconds: applyProgress.waitSeconds }) }}
        </template>
      </template>
    </p>
    <p v-if="applyProgress.viaFirecrawl > 0" class="ac-progress-note">
      <i class="pi pi-cloud-download" aria-hidden="true" />
      {{ t('bookUi.sync.viaFirecrawl', { count: applyProgress.viaFirecrawl }) }}
    </p>
  </div>
</template>

<style scoped>
.ac-progress {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  background: rgba(129, 140, 248, 0.08);
  border: 1px solid rgba(129, 140, 248, 0.2);
}

.ac-bar {
  height: 0.375rem;
}

.ac-progress-text {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.85);
}

.ac-progress-note {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  font-size: 0.74rem;
  color: rgb(199, 210, 254);
}
</style>
