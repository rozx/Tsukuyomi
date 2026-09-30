<template>
  <div class="space-y-2 lg:sticky lg:top-0">
    <label class="block text-sm font-medium text-moon/90">{{ i18nT('libraryUi.cover') }}</label>
    <div class="space-y-2">
      <div
        v-if="coverUrl"
        class="relative w-full aspect-[2/3] overflow-hidden rounded-lg bg-white/5 border border-white/10"
      >
        <img
          :src="coverUrl"
          :alt="i18nT('libraryUi.coverPreview')"
          class="w-full h-full object-cover"
        />
      </div>
      <div class="flex flex-nowrap gap-2 items-stretch">
        <Button
          :label="manageButtonLabel"
          :icon="manageButtonIcon"
          class="p-button-outlined flex-1 min-w-0"
          @click="emit('manage')"
        />
        <Button
          v-if="coverUrl"
          icon="pi pi-times"
          class="p-button-outlined p-button-danger flex-shrink-0"
          :title="i18nT('libraryUi.clearCover')"
          @click="emit('clear')"
        />
      </div>
      <!-- 封面 URL 显示和复制 -->
      <div v-if="coverUrl" class="space-y-1 p-2 card-base">
        <div class="flex items-center justify-between gap-2">
          <span class="text-moon/60 text-xs">URL:</span>
          <Button
            icon="pi pi-copy"
            class="p-button-text p-button-sm"
            size="small"
            :title="i18nT('libraryUi.copyUrl')"
            @click="emit('copy-url')"
          />
        </div>
        <a
          :href="coverUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-accent-400 hover:text-accent-300 hover:underline break-all text-xs cursor-pointer transition-colors"
        >
          {{ coverUrl }}
        </a>
      </div>
    </div>
    <small class="text-moon/60 text-xs block">{{ i18nT('libraryUi.coverHint') }}</small>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

import { computed } from 'vue';
import Button from 'primevue/button';
import type { Novel } from 'src/models/novel';

const props = defineProps<{
  cover?: Novel['cover'];
}>();

const emit = defineEmits<{
  manage: [];
  clear: [];
  'copy-url': [];
}>();

const coverUrl = computed(() => props.cover?.url);

// 管理/上传按钮的文案与图标
const manageButtonLabel = computed(() =>
  coverUrl.value ? i18nT('libraryUi.manageCover') : i18nT('libraryUi.uploadCover'),
);
const manageButtonIcon = computed(() => (coverUrl.value ? 'pi pi-image' : 'pi pi-upload'));
</script>
