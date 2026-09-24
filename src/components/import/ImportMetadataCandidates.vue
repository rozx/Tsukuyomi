<script setup lang="ts">
/**
 * 元信息候选与采用：月詠找到的作者、简介等只作为候选，用户采用后才进入草稿；
 * 已在草稿中的字段可选择导入时是否写入书库（例如更新时保留原作者）。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Tag from 'primevue/tag';
import { useImportWorkspaceStore } from 'src/stores/import-workspace';
import type { ImportDraft } from 'src/models/import';
import { METADATA_FIELDS, formatMetadataValue } from './import-labels';
import { useDraftLock } from './import-draft';

type Field = keyof ImportDraft['metadata'];
const OPTIONAL_FIELDS: Field[] = ['author', 'description', 'cover', 'alternateTitles', 'tags'];

const store = useImportWorkspaceStore();
const locked = useDraftLock();

const candidates = computed(() => store.task?.draft.metadataCandidates ?? []);
const adoptable = computed(() => {
  const metadata = store.task?.draft.metadata ?? {};
  return OPTIONAL_FIELDS.filter((field) => metadata[field]).map((field) => ({
    field,
    label: METADATA_FIELDS[field],
    adopted: Boolean(metadata[field]?.adopted),
  }));
});
const toggle = (field: Field, adopted: boolean) => void store.setMetadataAdoption(field, adopted);
</script>

<template>
  <section v-if="candidates.length || adoptable.length" class="ipl-card">
    <div class="ipl-card-head">
      <h3 class="ipl-card-title">
        <i class="pi pi-sparkles" aria-hidden="true" />元信息候选
        <span v-if="candidates.length" class="ipl-count">{{ candidates.length }}</span>
      </h3>
    </div>
    <template v-if="candidates.length">
      <p class="ipl-muted">月詠找到的信息只作为候选，采用后才会进入草稿。</p>
      <ul class="imc-list">
        <li v-for="candidate in candidates" :key="candidate.id" class="imc-row">
          <span class="imc-field">{{ METADATA_FIELDS[candidate.field] }}</span>
          <span class="imc-value">{{
            formatMetadataValue(candidate.field, candidate.value.value)
          }}</span>
          <span class="imc-actions">
            <Tag v-if="candidate.conflicts?.length" value="有冲突" severity="warn" />
            <span v-if="candidate.value.adopted" class="ipl-status ipl-status--success"
              >已采用</span
            >
            <Button
              v-else
              label="采用"
              size="small"
              outlined
              :disabled="locked"
              @click="store.adoptMetadata(candidate.id)"
            />
          </span>
        </li>
      </ul>
    </template>
    <div v-if="adoptable.length" class="imc-adopt">
      <span class="imc-adopt-title">导入时写入书库</span>
      <label v-for="entry in adoptable" :key="entry.field" class="imc-check">
        <Checkbox
          :model-value="entry.adopted"
          binary
          :disabled="locked"
          @update:model-value="(value: boolean) => toggle(entry.field, value)"
        />
        {{ entry.label }}
      </label>
    </div>
  </section>
</template>

<style scoped src="./import-card.css"></style>
<style scoped>
.imc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.imc-row {
  display: grid;
  grid-template-columns: 2.6rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  font-size: 0.8rem;
  background: rgba(0, 0, 0, 0.16);
}

.imc-field {
  color: rgba(226, 232, 240, 0.55);
}

.imc-value {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.imc-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.imc-adopt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.imc-adopt-title {
  font-size: 0.74rem;
  color: rgba(226, 232, 240, 0.6);
}

.imc-check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  cursor: pointer;
}
</style>
