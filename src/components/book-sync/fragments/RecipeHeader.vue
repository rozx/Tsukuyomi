<script setup lang="ts">
/** 来源与配方摘要：引擎、目录网址、清理规则数、已跳过数，以及重新检查。 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { recipe, changeset, working, recheck, target } = injectBookSync();

const engineLabel = computed(() => {
  const value = recipe.value;
  if (!value) return '';
  return value.engine === 'builtin' ? `内置站点 · ${value.site ?? ''}` : '通用网页配方';
});
const skippedCount = computed(() => changeset.value?.skipped.length ?? 0);
</script>

<template>
  <section class="ipl-card rh">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title"><i class="pi pi-link" aria-hidden="true" />来源</h3>
      <Button
        v-if="target"
        label="重新检查"
        icon="pi pi-refresh"
        size="small"
        text
        :disabled="working"
        @click="recheck()"
      />
    </div>
    <template v-if="recipe">
      <a :href="recipe.catalogUrl" target="_blank" rel="noopener noreferrer" class="rh-url">
        {{ recipe.catalogUrl }}
      </a>
      <dl class="rh-meta">
        <div>
          <dt>引擎</dt>
          <dd>{{ engineLabel }}</dd>
        </div>
        <div>
          <dt>清理规则</dt>
          <dd>{{ recipe.cleanupCount }} 条</dd>
        </div>
        <div>
          <dt>已跳过</dt>
          <dd>{{ skippedCount }} 章</dd>
        </div>
      </dl>
      <p v-if="recipe.virtual" class="ipl-muted">
        按内置站点自动推断的配方，尚未保存到书籍；首次同步后仍按站点规则回放。
      </p>
    </template>
    <p v-else class="ipl-muted">尚未建立更新配方</p>
  </section>
</template>

<style scoped src="../../import/import-card.css"></style>
<style scoped>
.rh-url {
  font-size: 0.78rem;
  color: rgb(165, 180, 252);
  word-break: break-all;
}

.rh-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.4rem;
  margin: 0;
}

.rh-meta > div {
  display: flex;
  gap: 0.4rem;
  font-size: 0.75rem;
}

.rh-meta dt {
  color: rgba(226, 232, 240, 0.5);
}

.rh-meta dd {
  margin: 0;
  color: rgba(226, 232, 240, 0.85);
}
</style>
