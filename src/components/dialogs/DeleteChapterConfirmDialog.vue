<template>
  <EntityDeleteConfirmDialog
    :visible="visible"
    :name="chapterTitle"
    :loading="loading"
    header-key="structureUi.confirmDelete"
    question-key="structureUi.deleteChapterQuestion"
    warning-key="structureUi.cannotUndo"
    @update:visible="emit('update:visible', $event)"
    @confirm="emit('confirm')"
  />
</template>
<script setup lang="ts">
import EntityDeleteConfirmDialog from './EntityDeleteConfirmDialog.vue';
defineProps<{ visible: boolean; chapterTitle: string; loading?: boolean }>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; confirm: [] }>();
</script>
