<template>
  <EntityDeleteConfirmDialog
    :visible="visible"
    :name="volumeTitle"
    :loading="loading"
    header-key="structureUi.confirmDelete"
    question-key="structureUi.deleteVolumeQuestion"
    warning-key="structureUi.deleteVolumeWarning"
    @update:visible="emit('update:visible', $event)"
    @confirm="emit('confirm')"
  />
</template>
<script setup lang="ts">
import EntityDeleteConfirmDialog from './EntityDeleteConfirmDialog.vue';
defineProps<{ visible: boolean; volumeTitle: string; loading?: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; confirm: [] }>();
</script>
