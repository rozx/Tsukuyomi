<script setup lang="ts">
/** 月詠桌宠气泡里的结果小结：章节任务完成 / 失败数，或助手「答好了」与回复开头 */
import { useI18n } from 'vue-i18n';
import type { DeskPetSummary } from 'src/composables/desk-pet/useDeskPet';

defineProps<{ summary: DeskPetSummary }>();
const emit = defineEmits<{ open: [event: MouseEvent]; dismiss: [] }>();

const { t } = useI18n();
</script>

<template>
  <button type="button" class="dps" @click="emit('open', $event)">
    <i
      class="pi"
      :class="[
        summary.kind === 'assistant' ? 'pi-comments' : 'pi-check-circle',
        { 'dps-icon--fail': summary.tone === 'fail' },
      ]"
      aria-hidden="true"
    />
    <span class="dps-text">{{ summary.text }}</span>
    <span v-if="summary.failed" class="dps-failed">
      {{ t('deskPetUi.summary.failed', { count: summary.failed }) }}
    </span>
  </button>
  <div v-if="summary.detail" class="dps-detail">{{ summary.detail }}</div>
  <div class="dps-footer">
    <button type="button" class="dp-link" @click="emit('dismiss')">
      {{ t('deskPetUi.summary.dismiss') }}
    </button>
  </div>
</template>

<style scoped>
.dps {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.dps i {
  font-size: 12px;
  color: #7fc29b;
}

.dps i.dps-icon--fail {
  color: #f0a3a3;
}

.dps-text {
  flex: 1;
  min-width: 0;
}

.dps-failed {
  flex-shrink: 0;
  font-size: 11px;
  color: #f0a3a3;
}

.dps-detail {
  margin-top: 2px;
  color: var(--moon-opacity-60);
}

.dps-footer {
  display: flex;
  margin-top: 6px;
}
</style>
