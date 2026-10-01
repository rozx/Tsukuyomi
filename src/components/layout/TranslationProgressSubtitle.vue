<template>
  <span v-if="hasTask && chapterLabel"> {{ chapterLabel }} · {{ workflowLabel }} </span>
  <span v-else-if="hasTask">{{ workflowLabel }}</span>
  <span v-else>{{ t('libraryUi.noTasks') }}</span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
defineProps<{
  hasTask: boolean;
  chapterLabel: string;
  workflowLabel: string;
}>();
</script>
