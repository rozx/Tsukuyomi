<script setup lang="ts">
/**
 * 一条待确认的多段替换：写明所在章节与译文损失，可展开对比旧原文与新原文后再确认。
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import type { ImportReplacementRange } from 'src/models/import-matching';

const props = defineProps<{
  entry: ImportReplacementRange;
  chapter: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ confirm: [signature: string] }>();
const { t } = useI18n();

const expanded = ref(false);
const hasTexts = !!props.entry.oldTexts && !!props.entry.newTexts;
</script>

<template>
  <li class="ipc-item ipr" data-testid="ipc-replacement">
    <div class="ipr-row">
      <span class="ipc-text">
        <strong v-if="chapter" class="ipr-chapter">{{ chapter }}</strong>
        {{
          t('importUi.planConflicts.replacement', {
            removed: entry.oldKeys.length,
            added: entry.newKeys.length,
            versions: entry.clearedVersions,
          })
        }}
      </span>
      <span class="ipr-actions">
        <Button
          v-if="hasTexts"
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
          :label="t('importUi.planConflicts.confirmReplacement')"
          size="small"
          severity="warn"
          outlined
          :disabled="disabled"
          @click="emit('confirm', entry.signature)"
        />
      </span>
    </div>
    <div v-if="expanded && hasTexts" class="ipr-compare">
      <section class="ipr-side ipr-side--old">
        <h4 class="ipr-label">
          {{ t('importUi.planConflicts.oldTexts', { count: entry.oldTexts!.length }) }}
        </h4>
        <p v-for="(text, index) in entry.oldTexts" :key="index" class="ipr-para">{{ text }}</p>
      </section>
      <section class="ipr-side ipr-side--new">
        <h4 class="ipr-label">
          {{ t('importUi.planConflicts.newTexts', { count: entry.newTexts!.length }) }}
        </h4>
        <p v-for="(text, index) in entry.newTexts" :key="index" class="ipr-para">{{ text }}</p>
      </section>
    </div>
  </li>
</template>

<style scoped>
.ipr {
  flex-direction: column;
  align-items: stretch;
}

.ipr-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
}

.ipr-chapter {
  margin-right: 0.35rem;
  font-weight: 600;
  color: rgba(247, 244, 236, 0.95);
}

.ipr-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.ipr-compare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.ipr-side {
  max-height: 16rem;
  overflow-y: auto;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  scrollbar-width: thin;
}

.ipr-side--old {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.ipr-side--new {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.ipr-label {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.6);
}

.ipr-para {
  margin: 0 0 0.3rem;
  font-size: 0.78rem;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ipr-para:empty::before {
  content: '⏎';
  color: rgba(226, 232, 240, 0.3);
}
</style>
