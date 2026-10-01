<template>
  <EntityDeleteConfirmDialog
    :visible="visible"
    :name="characterName"
    :loading="loading"
    header-key="structureUi.confirmDeleteCharacter"
    question-key="structureUi.deleteCharacterQuestion"
    warning-key="structureUi.cannotUndo"
    @update:visible="emit('update:visible', $event)"
    @confirm="emit('confirm')"
  />
</template>
<script setup lang="ts">
import EntityDeleteConfirmDialog from './EntityDeleteConfirmDialog.vue';
defineProps<{ visible: boolean; characterName: string | null; loading?: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; confirm: [] }>();
</script>
