<template>
  <EntityDeleteConfirmDialog
    :visible="visible"
    :name="termName"
    :loading="loading"
    header-key="structureUi.confirmDeleteTerm"
    question-key="structureUi.deleteTermQuestion"
    warning-key="structureUi.cannotUndo"
    @update:visible="emit('update:visible', $event)"
    @confirm="emit('confirm')"
  />
</template>
<script setup lang="ts">
import EntityDeleteConfirmDialog from './EntityDeleteConfirmDialog.vue';
defineProps<{ visible: boolean; termName: string | null; loading?: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; confirm: [] }>();
</script>
