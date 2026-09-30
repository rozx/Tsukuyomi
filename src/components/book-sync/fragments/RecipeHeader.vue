<script setup lang="ts">
/** 来源：站点与目录网址、重新检查；引擎、清理规则等配方细节默认收起。 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { injectBookSync } from 'src/composables/book-sync/useBookSync';

const { recipe, working, recheck, target } = injectBookSync();

const { t } = useI18n();
const expanded = ref(false);
const siteLabel = computed(() => {
  const value = recipe.value;
  if (!value) return '';
  return value.engine === 'builtin'
    ? (value.site ?? t('bookUi.sync.builtinSite'))
    : t('bookUi.sync.webSource');
});
const engineLabel = computed(() =>
  t(recipe.value?.engine === 'builtin' ? 'bookUi.sync.builtinEngine' : 'bookUi.sync.htmlEngine'),
);
</script>

<template>
  <section class="rh">
    <div class="rh-row">
      <i class="pi pi-link rh-icon" aria-hidden="true" />
      <template v-if="recipe">
        <span class="rh-site">{{ siteLabel }}</span>
        <a :href="recipe.catalogUrl" target="_blank" rel="noopener noreferrer" class="rh-url">
          {{ recipe.catalogUrl }}
        </a>
      </template>
      <span v-else class="rh-url rh-url--none">{{ t('bookUi.sync.recipeNone') }}</span>
      <span class="rh-actions">
        <Button
          v-if="recipe"
          :label="t('bookUi.sync.recipeDetails')"
          :icon="expanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          icon-pos="right"
          size="small"
          text
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        />
        <Button
          v-if="target"
          :label="t('bookUi.sync.recheck')"
          icon="pi pi-refresh"
          size="small"
          text
          :disabled="working"
          @click="recheck()"
        />
      </span>
    </div>
    <dl v-if="recipe && expanded" class="rh-meta">
      <div>
        <dt>{{ t('bookUi.sync.engine') }}</dt>
        <dd>{{ engineLabel }}</dd>
      </div>
      <div>
        <dt>{{ t('bookUi.sync.cleanupRules') }}</dt>
        <dd>{{ t('bookUi.sync.cleanupCount', { count: recipe.cleanupCount }) }}</dd>
      </div>
      <p v-if="recipe.virtual" class="rh-note">
        {{ t('bookUi.sync.virtualNote') }}
      </p>
    </dl>
  </section>
</template>

<style scoped>
.rh {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.rh-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.rh-icon {
  font-size: 0.8rem;
  color: rgba(165, 180, 252, 0.8);
}

.rh-site {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(241, 245, 249, 0.9);
}

.rh-url {
  flex: 1 1 10rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  color: rgb(165, 180, 252);
}

.rh-url--none {
  color: rgba(226, 232, 240, 0.55);
}

.rh-actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.2rem;
  margin-left: auto;
}

.rh-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.4rem;
  margin: 0;
  padding-left: 1.35rem;
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

.rh-note {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.55);
}
</style>
