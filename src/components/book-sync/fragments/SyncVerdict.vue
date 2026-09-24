<script setup lang="ts">
/**
 * 检查结论：先回答「有没有更新」，再用一行说明各类数量（只列非零项）。
 * 已有书籍还有未比对正文的章节时，在这里提供逐章比对（带进度，可取消）。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';
import { syncVerdict } from 'src/composables/book-sync/book-sync-rules';

const { changeset, drift, deep, working, target, startDeepCheck, cancelDeepCheck } =
  injectBookSync();

const ICONS = {
  latest: 'pi pi-check-circle',
  changes: 'pi pi-sparkles',
  pending: 'pi pi-info-circle',
  failed: 'pi pi-exclamation-circle',
} as const;

const creating = computed(() => !!target.value && 'newFrom' in target.value);
const verdict = computed(() =>
  changeset.value ? syncVerdict(changeset.value, creating.value) : undefined,
);
const percent = computed(() =>
  deep.value.total ? Math.round((deep.value.completed / deep.value.total) * 100) : 0,
);
</script>

<template>
  <section
    v-if="verdict"
    class="ipl-card sv"
    :class="`sv--${verdict.tone}`"
    data-testid="bsw-summary"
  >
    <div class="sv-head">
      <i :class="ICONS[verdict.tone]" class="sv-icon" aria-hidden="true" />
      <div class="sv-text">
        <h3 class="sv-title">{{ verdict.title }}</h3>
        <p class="sv-details">
          <span v-for="(detail, index) in verdict.details" :key="detail" class="sv-detail">
            <template v-if="index"> · </template>{{ detail }}
          </span>
        </p>
      </div>
    </div>
    <div v-if="drift" class="ipl-banner ipl-banner--warn" role="alert">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>
        已比对的章节中超过半数显示有修订，可能是站点改版或配方过期。请先查看几章差异再决定是否应用；
        有修订的章节不会被自动勾选。
      </span>
    </div>
    <div v-if="!creating && (deep.running || verdict.deepHint)" class="sv-deep">
      <template v-if="deep.running">
        <div class="sv-deep-row">
          <span class="sv-hint">
            正在逐章比对正文
            <template v-if="deep.total">{{ deep.completed }} / {{ deep.total }}</template>
          </span>
          <Button
            label="取消"
            aria-label="取消深度检查"
            size="small"
            severity="secondary"
            text
            @click="cancelDeepCheck"
          />
        </div>
        <ProgressBar :value="percent" :show-value="false" class="sv-bar" />
      </template>
      <div v-else class="sv-deep-row">
        <span class="sv-hint">{{ verdict.deepHint }}</span>
        <Button
          label="逐章比对正文"
          icon="pi pi-search"
          size="small"
          outlined
          :disabled="working"
          @click="startDeepCheck()"
        />
      </div>
    </div>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped>
.sv-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.sv-icon {
  margin-top: 0.1rem;
  font-size: 1.35rem;
  color: rgb(165, 180, 252);
}

.sv--latest .sv-icon {
  color: rgb(134, 239, 172);
}

.sv--failed .sv-icon {
  color: rgb(252, 165, 165);
}

.sv-text {
  min-width: 0;
}

.sv-title {
  margin: 0;
  font-size: 1rem;
  line-height: 1.5;
  font-weight: 600;
  color: rgba(241, 245, 249, 0.95);
}

.sv-details {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.65);
}

.sv-detail {
  white-space: nowrap;
}

.sv-deep {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.sv-deep-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.sv-hint {
  font-size: 0.76rem;
  color: rgba(226, 232, 240, 0.7);
}

.sv-bar {
  height: 0.3rem;
}
</style>
