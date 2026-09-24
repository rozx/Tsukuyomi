<script setup lang="ts">
/**
 * 方案中的更新配方：新增、替换、保留原有，或声明已失效（本次不写入，保留原配方）。
 * 没有声明且目标书没有配方时不显示。
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import type { ImportPlan, ImportRecipeSummary } from 'src/models/import';
import { recipeEngineLabel } from 'src/composables/import-page/import-recipe-description';

const props = defineProps<{ plan: ImportPlan }>();

const KINDS = {
  add: { label: '新增', severity: 'success', text: '应用后这本书可以按配方检查更新。' },
  replace: { label: '替换', severity: 'info', text: '应用后用新配方替换这本书原有的配方。' },
  keep: {
    label: '保留原有',
    severity: 'secondary',
    text: '本次没有声明配方，保留这本书原有的配方。',
  },
  stale: {
    label: '已失效',
    severity: 'warn',
    text: '配方已失效，本次不会写入配方；其余导入内容照常应用，原有配方保持不变。',
  },
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
      <h3 class="ipl-card-title"><i class="pi pi-sync" aria-hidden="true" />更新配方</h3>
      <Tag :value="kind.label" :severity="kind.severity" data-testid="ipr-kind" />
    </div>
    <p class="ipl-muted">{{ kind.text }}</p>
    <dl v-if="shown" class="ipr-facts">
      <dt>引擎</dt>
      <dd>{{ recipeEngineLabel(shown.engine) }}</dd>
      <dt>目录</dt>
      <dd class="ipr-url">{{ shown.catalogUrls[0] }}</dd>
      <dt>可复现</dt>
      <dd data-testid="ipr-verified">{{ change.verified }} 章</dd>
      <template v-if="shown.pinned">
        <dt>固定正文</dt>
        <dd>{{ shown.pinned }} 章</dd>
      </template>
      <template v-if="shown.cleanupRules">
        <dt>清理规则</dt>
        <dd>{{ shown.cleanupRules }} 条</dd>
      </template>
    </dl>
    <template v-if="change.kind === 'stale'">
      <p v-if="change.reason" class="ipr-reason" data-testid="ipr-reason">{{ change.reason }}</p>
      <ul v-if="issues.length" class="ipr-issues">
        <li v-for="(issue, index) in issues" :key="index">{{ issue.message }}</li>
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
