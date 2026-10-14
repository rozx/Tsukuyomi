<script setup lang="ts">
/**
 * 一章内全部待确认的多段替换：一行汇总处数、段数与译文损失，一次确认整章；
 * 可展开逐处对比旧原文与新原文（旧版本保存的方案没有原文，不提供展开）。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import type { ReplacementGroup } from 'src/composables/import-page/import-plan-pending';

const props = defineProps<{ group: ReplacementGroup; chapter: string; disabled: boolean }>();
const emit = defineEmits<{ confirm: [signatures: string[]] }>();
const { t } = useI18n();

const expanded = ref(false);
const comparable = computed(() =>
  props.group.entries.filter((entry) => entry.oldTexts && entry.newTexts),
);
</script>

<template>
  <li class="iprg" data-testid="ipc-replacement">
    <div class="iprg-row">
      <span class="iprg-text">
        <strong v-if="chapter" class="iprg-chapter">{{ chapter }}</strong>
        {{
          t('importUi.planConflicts.replacementGroup', {
            ranges: group.ranges,
            removed: group.removed,
            added: group.added,
            versions: group.versions,
          })
        }}
      </span>
      <span class="iprg-actions">
        <Button
          v-if="comparable.length"
          :label="
            expanded ? t('importUi.planConflicts.hideTexts') : t('importUi.planConflicts.showTexts')
          "
          :icon="expanded ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
          size="small"
          text
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        />
        <Button
          :label="t('importUi.planConflicts.confirmChapter')"
          size="small"
          severity="warn"
          outlined
          :disabled="disabled"
          @click="emit('confirm', group.signatures)"
        />
      </span>
    </div>
    <ol v-if="expanded" class="iprg-ranges">
      <li v-for="entry in comparable" :key="entry.signature" class="iprg-compare">
        <section class="iprg-side iprg-side--old">
          <h4 class="iprg-label">
            {{ t('importUi.planConflicts.oldTexts', { count: entry.oldTexts!.length }) }}
          </h4>
          <p v-for="(text, index) in entry.oldTexts" :key="index" class="iprg-para">{{ text }}</p>
        </section>
        <section class="iprg-side iprg-side--new">
          <h4 class="iprg-label">
            {{ t('importUi.planConflicts.newTexts', { count: entry.newTexts!.length }) }}
          </h4>
          <p v-for="(text, index) in entry.newTexts" :key="index" class="iprg-para">{{ text }}</p>
        </section>
      </li>
    </ol>
  </li>
</template>

<style scoped>
.iprg {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.18);
}

.iprg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
}

.iprg-text {
  flex: 1 1 14rem;
  min-width: 0;
  line-height: 1.5;
  text-align: left;
}

.iprg-chapter {
  margin-right: 0.35rem;
  font-weight: 600;
  color: rgba(247, 244, 236, 0.95);
}

.iprg-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.35rem;
}

.iprg-ranges {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 28rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: thin;
}

.iprg-compare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.5rem;
}

.iprg-side {
  max-height: 16rem;
  overflow-y: auto;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  scrollbar-width: thin;
}

.iprg-side--old {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.iprg-side--new {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.iprg-label {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.6);
}

.iprg-para {
  margin: 0 0 0.3rem;
  font-size: 0.78rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.iprg-para:empty::before {
  content: '⏎';
  color: rgba(226, 232, 240, 0.3);
}
</style>
