<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import type { AppLocale } from 'src/models/locale';
import { getNameTranslation } from 'src/services/localization/selection';
import { toRef } from 'vue';
import Popover from 'primevue/popover';
import DataView from 'primevue/dataview';
import Button from 'primevue/button';
import EntityPopoverHeader from './EntityPopoverHeader.vue';
import { useEntityListPopover } from 'src/composables/novel/useEntityListPopover';
import type { Terminology } from 'src/models/novel';
const { t } = useI18n();

const props = defineProps<{
  usedTerms: Terminology[];
  targetLanguage?: AppLocale;
}>();

const emit = defineEmits<{
  edit: [term: Terminology];
  delete: [term: Terminology];
  create: [];
}>();

const {
  popover,
  count: usedTermCount,
  handleEdit,
  handleDelete,
  handleCreate,
  toggle,
  hide,
} = useEntityListPopover<Terminology>(toRef(props, 'usedTerms'), emit);

defineExpose({ popover, toggle, hide });
const translationText = (owner: Terminology) =>
  getNameTranslation(owner, props.targetLanguage ?? 'zh-CN')?.translation ?? '';
</script>

<template>
  <Popover ref="popover" style="width: 24rem; max-width: 90vw">
    <div class="flex flex-col max-h-[60vh] overflow-hidden">
      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <DataView :value="usedTerms" data-key="id" layout="list" class="term-popover-dataview">
          <template #header>
            <EntityPopoverHeader
              :title="t('panelUi.chapterTerms')"
              :count="usedTermCount"
              @create="handleCreate"
            />
          </template>
          <template #list="slotProps">
            <div class="flex flex-col gap-2 p-2">
              <div
                v-for="term in slotProps.items"
                :key="term.id"
                class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div class="flex justify-between items-start gap-2 min-w-0">
                  <div class="min-w-0 flex-1 overflow-hidden">
                    <div class="font-medium text-sm text-moon-90 break-words">
                      {{ term.name }}
                    </div>
                    <div class="text-xs text-primary-400 mt-0.5 break-words">
                      {{ translationText(term) }}
                    </div>
                    <div
                      v-if="term.description"
                      class="text-xs text-moon/50 mt-1 line-clamp-2 break-words"
                    >
                      {{ term.description }}
                    </div>
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <Button
                      icon="pi pi-pencil"
                      :aria-label="t('panelUi.edit')"
                      class="p-button-text p-button-sm !p-1 !w-7 !h-7"
                      @click="handleEdit(term)"
                    />
                    <Button
                      icon="pi pi-trash"
                      :aria-label="t('panelUi.delete')"
                      class="p-button-text p-button-danger p-button-sm !p-1 !w-7 !h-7"
                      @click="handleDelete(term)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #empty>
            <div class="text-center py-8 text-moon/50 text-sm">
              {{ t('panelUi.noChapterTerms') }}
            </div>
          </template>
        </DataView>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
:deep(.term-popover-dataview) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent !important;
}

:deep(.term-popover-dataview .p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  background: transparent !important;
}
</style>
