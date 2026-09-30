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
import type { CharacterSetting } from 'src/models/novel';
const { t } = useI18n();

const props = defineProps<{
  usedCharacters: CharacterSetting[];
  targetLanguage?: AppLocale;
}>();

const emit = defineEmits<{
  edit: [character: CharacterSetting];
  delete: [character: CharacterSetting];
  create: [];
}>();

const {
  popover,
  count: usedCharacterCount,
  handleEdit,
  handleDelete,
  handleCreate,
  toggle,
  hide,
} = useEntityListPopover<CharacterSetting>(toRef(props, 'usedCharacters'), emit);

defineExpose({ popover, toggle, hide });
const translationText = (owner: CharacterSetting) =>
  getNameTranslation(owner, props.targetLanguage ?? 'zh-CN')?.translation ?? '';
</script>

<template>
  <Popover ref="popover" style="width: 24rem; max-width: 90vw">
    <div class="flex flex-col max-h-[60vh] overflow-hidden">
      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <DataView
          :value="usedCharacters"
          data-key="id"
          layout="list"
          class="character-popover-dataview"
        >
          <template #header>
            <EntityPopoverHeader
              :title="t('panelUi.chapterCharacters')"
              :count="usedCharacterCount"
              @create="handleCreate"
            />
          </template>
          <template #list="slotProps">
            <div class="flex flex-col gap-2 p-2">
              <div
                v-for="character in slotProps.items"
                :key="character.id"
                class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div class="flex justify-between items-start gap-2 min-w-0">
                  <div class="min-w-0 flex-1 overflow-hidden">
                    <div class="flex items-center gap-2">
                      <div class="font-medium text-sm text-moon-90 break-words">
                        {{ character.name }}
                      </div>
                      <span
                        v-if="character.sex"
                        class="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary-400"
                      >
                        {{
                          character.sex === 'male'
                            ? t('panelUi.maleShort')
                            : character.sex === 'female'
                              ? t('panelUi.femaleShort')
                              : t('panelUi.other')
                        }}
                      </span>
                    </div>
                    <div class="text-xs text-primary-400 mt-0.5 break-words">
                      {{ translationText(character) }}
                    </div>
                    <div
                      v-if="character.description"
                      class="text-xs text-moon/50 mt-1 line-clamp-2 break-words"
                    >
                      {{ character.description }}
                    </div>
                    <div
                      v-if="character.aliases && character.aliases.length > 0"
                      class="text-xs text-moon/60 mt-1"
                    >
                      <span class="text-moon/50">{{ t('panelUi.aliasesLabel') }}</span>
                      <span class="break-words">
                        {{
                          character.aliases
                            .map((a: { name: string }) => a.name)
                            .join(t('panelUi.separator'))
                        }}
                      </span>
                    </div>
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <Button
                      icon="pi pi-pencil"
                      :aria-label="t('panelUi.edit')"
                      class="p-button-text p-button-sm !p-1 !w-7 !h-7"
                      @click="handleEdit(character)"
                    />
                    <Button
                      icon="pi pi-trash"
                      :aria-label="t('panelUi.delete')"
                      class="p-button-text p-button-danger p-button-sm !p-1 !w-7 !h-7"
                      @click="handleDelete(character)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #empty>
            <div class="text-center py-8 text-moon/50 text-sm">
              {{ t('panelUi.noChapterCharacters') }}
            </div>
          </template>
        </DataView>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
:deep(.character-popover-dataview) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  background: transparent !important;
}

:deep(.character-popover-dataview .p-dataview-content) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  background: transparent !important;
}
</style>
