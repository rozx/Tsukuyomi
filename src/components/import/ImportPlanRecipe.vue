<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import { importNoticeText } from 'src/services/import/import-error';

/**
 * 方案中的更新配方：新增、替换、保留原有，或声明已失效（本次不写入，保留原配方）。
 * 没有声明且目标书没有配方时不显示。
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import type { ImportPlan, ImportRecipeSummary } from 'src/models/import';
import { recipeEngineLabel } from 'src/composables/import-page/import-recipe-description';

const { t, locale } = useI18n();
const uiLocale = computed(() => resolveAppLocale(locale.value));
const noticeText = (value: unknown) => importNoticeText(value, uiLocale.value);

const props = defineProps<{ plan: ImportPlan }>();

const KINDS = {
  add: { label: 'importUi.recipe.add', severity: 'success', text: 'importUi.recipe.addText' },
  replace: {
    label: 'importUi.recipe.replace',
    severity: 'info',
    text: 'importUi.recipe.replaceText',
  },
  keep: { label: 'importUi.recipe.keep', severity: 'secondary', text: 'importUi.recipe.keepText' },
  stale: { label: 'importUi.recipe.stale', severity: 'warn', text: 'importUi.recipe.staleText' },
} as const;

const change = computed(() => props.plan.recipeChange);
const kind = computed(() => (change.value ? KINDS[change.value.kind] : undefined));
const shown = computed<ImportRecipeSummary | undefined>(() =>
  change.value?.kind === 'keep' ? change.value.before : change.value?.after,
);
const issues = computed(() => change.value?.issues?.slice(0, 5) ?? []);
</script>

<template>
  <section v-if="change && kind" class="ipl-card" data-testid="ipr-recipe">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-sync" aria-hidden="true" />{{ t('importUi.recipe.title') }}
      </h3>
      <Tag :value="t(kind.label)" :severity="kind.severity" data-testid="ipr-kind" />
    </div>
    <p class="ipl-muted">{{ t(kind.text) }}</p>
    <dl v-if="shown" class="ipr-facts">
      <dt>{{ t('importUi.recipe.engine') }}</dt>
      <dd>{{ recipeEngineLabel(shown.engine, uiLocale) }}</dd>
      <dt>{{ t('importUi.recipe.catalog') }}</dt>
      <dd class="ipr-url">{{ shown.catalogUrls[0] }}</dd>
      <dt>{{ t('importUi.recipe.verified') }}</dt>
      <dd data-testid="ipr-verified">
        {{ t('importUi.recipe.chapters', { count: change.verified }) }}
      </dd>
      <template v-if="shown.pinned">
        <dt>{{ t('importUi.recipe.pinned') }}</dt>
        <dd>{{ t('importUi.recipe.chapters', { count: shown.pinned }) }}</dd>
      </template>
      <template v-if="shown.cleanupRules">
        <dt>{{ t('importUi.recipe.cleanup') }}</dt>
        <dd>{{ t('importUi.recipe.rules', { count: shown.cleanupRules }) }}</dd>
      </template>
    </dl>
    <template v-if="change.kind === 'stale'">
      <p v-if="change.reason" class="ipr-reason" data-testid="ipr-reason">
        {{ noticeText(change.reason) }}
      </p>
      <ul v-if="issues.length" class="ipr-issues">
        <li v-for="(issue, index) in issues" :key="index">{{ noticeText(issue) }}</li>
      </ul>
    </template>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.ipr-facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.3rem 0.75rem;
  margin: 0;
  font-size: 0.78rem;
}

.ipr-facts dt {
  color: rgba(148, 163, 184, 0.85);
}

.ipr-facts dd {
  margin: 0;
  min-width: 0;
  color: rgba(226, 232, 240, 0.9);
}

.ipr-url {
  overflow-wrap: anywhere;
}

.ipr-reason {
  margin: 0;
  font-size: 0.76rem;
  color: rgb(253, 186, 116);
}

.ipr-issues {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.8);
}
</style>
