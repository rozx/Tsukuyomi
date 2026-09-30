<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import { importNoticeText } from 'src/services/import/import-error';

/** 方案的元信息变化与完整性，宽屏并排、窄屏上下排列。 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import type { ImportPlan } from 'src/models/import';
import { METADATA_FIELDS } from './import-labels';

const { t, locale } = useI18n();
const noticeText = (value: unknown) => importNoticeText(value, resolveAppLocale(locale.value));

const props = defineProps<{ plan: ImportPlan }>();

const MISSING_SHOWN = 12;

const fieldLabel = (field: string) => {
  const key = METADATA_FIELDS[field as keyof typeof METADATA_FIELDS];
  return key ? t(key) : field;
};

const completeness = computed(() => {
  const { confirmed, knownTotal, missing } = props.plan.completeness;
  const known = confirmed && knownTotal !== undefined;
  return {
    known,
    text: known
      ? t('importUi.planDetails.knownTotal', { count: knownTotal })
      : t('importUi.planDetails.unconfirmed'),
    missing: missing.slice(0, MISSING_SHOWN),
    more: Math.max(0, missing.length - MISSING_SHOWN),
    total: missing.length,
  };
});
</script>

<template>
  <div class="ipdt">
    <section class="ipl-card">
      <div class="ipl-card-head">
        <h3 class="ipl-card-title">
          <i class="pi pi-id-card" aria-hidden="true" />{{ t('importUi.planDetails.metadata') }}
        </h3>
        <span v-if="plan.metadataChanges.length" class="ipl-count">
          {{ t('importUi.planDetails.metadataChanges', { count: plan.metadataChanges.length }) }}
        </span>
      </div>
      <p v-if="!plan.metadataChanges.length" class="ipl-muted">
        {{ t('importUi.planDetails.noMetadataChanges') }}
      </p>
      <dl v-else class="ipdt-meta">
        <template v-for="change in plan.metadataChanges" :key="change.field">
          <dt>{{ fieldLabel(change.field) }}</dt>
          <dd>
            <span v-if="change.before" class="ipdt-before">{{ change.before }}</span>
            <span class="ipdt-after">{{ change.after }}</span>
          </dd>
        </template>
      </dl>
    </section>

    <section class="ipl-card">
      <div class="ipl-card-head">
        <h3 class="ipl-card-title">
          <i class="pi pi-list" aria-hidden="true" />{{ t('importUi.planDetails.completeness') }}
        </h3>
        <Tag
          :value="
            t(
              completeness.known
                ? 'importUi.planDetails.confirmed'
                : 'importUi.planDetails.notConfirmed',
            )
          "
          :severity="completeness.known ? 'success' : 'warn'"
        />
      </div>
      <p class="ipl-muted">{{ completeness.text }}</p>
      <template v-if="completeness.total">
        <div class="ipdt-missing-title">
          {{ t('importUi.planDetails.missing', { count: completeness.total }) }}
        </div>
        <ul class="ipdt-missing">
          <li v-for="(item, index) in completeness.missing" :key="index">{{ noticeText(item) }}</li>
          <li v-if="completeness.more" class="ipdt-more">
            {{ t('importUi.planDetails.more', { count: completeness.more }) }}
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.ipdt {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.75rem;
  align-items: start;
}

.ipdt-meta {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.45rem 0.85rem;
  margin: 0;
  font-size: 0.78rem;
}

.ipdt-meta dt {
  color: rgba(226, 232, 240, 0.55);
}

.ipdt-meta dd {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.ipdt-before,
.ipdt-after {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.ipdt-before {
  color: rgba(226, 232, 240, 0.4);
  text-decoration: line-through;
}

.ipdt-missing-title {
  font-size: 0.74rem;
  font-weight: 600;
  color: rgb(253, 186, 116);
}

.ipdt-missing {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.ipdt-missing li {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  color: rgba(254, 215, 170, 0.9);
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.22);
}

.ipdt-missing .ipdt-more {
  color: rgba(226, 232, 240, 0.6);
  background: transparent;
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.15);
}
</style>
