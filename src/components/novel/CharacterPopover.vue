<script setup lang="ts">
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import DataView from 'primevue/dataview';
import Button from 'primevue/button';
import type { CharacterSetting } from 'src/models/novel';

const props = defineProps<{
  usedCharacters: CharacterSetting[];
}>();

const emit = defineEmits<{
  edit: [character: CharacterSetting];
  delete: [character: CharacterSetting];
  create: [];
}>();

const popover = ref<InstanceType<typeof Popover> | null>(null);

const usedCharacterCount = computed(() => props.usedCharacters.length);

const handleEdit = (character: CharacterSetting) => {
  emit('edit', character);
};

const handleDelete = (character: CharacterSetting) => {
  emit('delete', character);
};

const handleCreate = () => {
  emit('create');
};

// Expose popover ref for parent component to toggle
defineExpose({
  popover,
  toggle: (event: Event) => {
    popover.value?.toggle(event);
  },
  hide: () => {
    popover.value?.hide();
  },
});
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
            <div class="p-3">
              <div class="flex justify-between items-start gap-2">
                <div>
                  <h4 class="font-medium text-moon-100">本章使用的角色设定</h4>
                  <p class="text-xs text-moon/60 mt-1">共 {{ usedCharacterCount }} 个</p>
                </div>
                <Button
                  icon="pi pi-plus"
                  label="新建"
                  size="small"
                  class="!text-xs !px-2 !py-1 !h-auto"
                  @click="handleCreate"
                />
              </div>
            </div>
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
                            ? '男'
                            : character.sex === 'female'
                              ? '女'
                              : '其他'
                        }}
                      </span>
                    </div>
                    <div class="text-xs text-primary-400 mt-0.5 break-words">
                      {{ character.translation.translation }}
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
                      <span class="text-moon/50">别名：</span>
                      <span class="break-words">
                        {{ character.aliases.map((a: { name: string }) => a.name).join('、') }}
                      </span>
                    </div>
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <Button
                      icon="pi pi-pencil"
                      class="p-button-text p-button-sm !p-1 !w-7 !h-7"
                      @click="handleEdit(character)"
                    />
                    <Button
                      icon="pi pi-trash"
                      class="p-button-text p-button-danger p-button-sm !p-1 !w-7 !h-7"
                      @click="handleDelete(character)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #empty>
            <div class="text-center py-8 text-moon/50 text-sm">本章暂无角色设定</div>
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

