<script setup lang="ts">
/**
 * 无法回放时的说明与后续入口：缺少配方、配方失效或检查出错。
 * 这些状态下不显示任何章节列表或应用操作。AI 导入关闭时隐藏交接入口。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { phase, message, target, canHandoff, working, recheck, handoff } = injectBookSync();

const { t } = useI18n();
const creating = computed(() => !!target.value && 'newFrom' in target.value);

const title = computed(() => {
  if (phase.value === 'missing')
    return t(creating.value ? 'bookUi.sync.needsImporter' : 'bookUi.sync.noRecipe');
  if (phase.value === 'invalid') return t('bookUi.sync.recipeInvalid');
  return t('bookUi.sync.checkFailed');
});

const description = computed(() => {
  if (phase.value === 'missing')
    return t(creating.value ? 'bookUi.sync.missingCreateDesc' : 'bookUi.sync.missingBookDesc');
  if (phase.value === 'invalid') return t('bookUi.sync.invalidDesc', { reason: message.value });
  return message.value;
});

const showHandoff = computed(() => phase.value !== 'error' && canHandoff);
// 已有书籍打开（或新建）这本书的配方修复任务，不会自动运行
const handoffLabel = computed(() =>
  t(
    creating.value
      ? 'bookUi.sync.handoffCreate'
      : phase.value === 'missing'
        ? 'bookUi.sync.handoffBuild'
        : 'bookUi.sync.handoffRepair',
  ),
);
</script>

<template>
  <section class="ipl-card hn" role="status">
    <h3 class="ipl-card-title">
      <i
        :class="phase === 'error' ? 'pi pi-times-circle' : 'pi pi-exclamation-triangle'"
        aria-hidden="true"
      />
      {{ title }}
    </h3>
    <p class="hn-text">{{ description }}</p>
    <p v-if="phase !== 'error' && !canHandoff" class="ipl-muted">
      {{ t('bookUi.sync.importDisabled') }}
    </p>
    <div class="hn-actions">
      <Button
        v-if="showHandoff"
        :label="handoffLabel"
        icon="pi pi-sparkles"
        size="small"
        :disabled="working"
        @click="handoff()"
      />
      <Button
        v-if="phase !== 'missing'"
        :label="t('bookUi.sync.recheck')"
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        outlined
        :disabled="working"
        @click="recheck()"
      />
    </div>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped>
.hn {
  border-color: rgba(234, 179, 8, 0.22);
}

.hn-text {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.8);
}

.hn-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
