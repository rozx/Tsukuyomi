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
import { METADATA_FIELDS } from './import-labels';
import { useDraftLock } from './import-draft';

type Field = keyof ImportDraft['metadata'];
const OPTIONAL_FIELDS: Field[] = ['author', 'description', 'cover', 'alternateTitles'];

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
  <div v-if="candidates.length || adoptable.length" class="imc">
    <template v-if="candidates.length">
      <div class="imc-title">元信息候选（需采用后才会写入）</div>
      <div v-for="candidate in candidates" :key="candidate.id" class="imc-row">
        <span class="imc-field">{{ METADATA_FIELDS[candidate.field] }}</span>
        <span class="imc-value">{{ candidate.value.value }}</span>
        <Tag v-if="candidate.conflicts?.length" value="有冲突" severity="warn" />
        <Tag v-if="candidate.value.adopted" value="已采用" severity="success" />
        <Button
          v-else
          label="采用"
          size="small"
          text
          :disabled="locked"
          @click="store.adoptMetadata(candidate.id)"
        />
      </div>
    </template>
    <div v-if="adoptable.length" class="imc-adopt">
      <span class="imc-title">导入时写入：</span>
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
  </div>
</template>

<style scoped>
.imc {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.imc-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.75);
}

.imc-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.imc-field {
  color: rgba(226, 232, 240, 0.55);
  min-width: 2.5rem;
}

.imc-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.imc-adopt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
}

.imc-check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  cursor: pointer;
}
</style>
