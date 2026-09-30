<template>
  <div class="space-y-3">
    <div class="text-sm font-medium text-moon/90">{{ t('coverUi.currentCover') }}</div>
    <div
      class="relative w-full aspect-[2/3] max-w-xs mx-auto overflow-hidden rounded-lg bg-white/5 border border-white/10"
    >
      <img
        :src="cover.url"
        :alt="t('coverUi.preview')"
        class="w-full h-full object-cover"
        @error="
          (e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }
        "
      />
    </div>
    <!-- 封面详细信息 -->
    <div class="space-y-2 p-3 bg-white/5 rounded-lg border border-white/10">
      <div class="space-y-1.5 text-xs">
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-moon/60">URL:</span>
            <Button
              icon="pi pi-copy"
              class="p-button-text p-button-sm"
              size="small"
              :title="t('coverUi.copyUrl')"
              @click="emit('copy-url')"
            />
          </div>
          <a
            :href="cover.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent-400 hover:text-accent-300 hover:underline break-all text-xs cursor-pointer transition-colors"
          >
            {{ cover.url }}
          </a>
        </div>
        <div v-if="info" class="flex items-center justify-between gap-2">
          <span class="text-moon/60">{{ t('coverUi.dimensions') }}</span>
          <span class="text-moon/90">{{ info.width }} × {{ info.height }} px</span>
        </div>
        <div v-if="info?.size" class="flex items-center justify-between gap-2">
          <span class="text-moon/60">{{ t('coverUi.size') }}</span>
          <span class="text-moon/90">{{ formatFileSize(info.size) }}</span>
        </div>
        <div v-if="info && !info.size" class="flex items-center justify-between gap-2">
          <span class="text-moon/60">{{ t('coverUi.size') }}</span>
          <span class="text-moon/60 italic">{{ t('coverUi.unavailable') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { formatFileSize } from 'src/utils/format';
import type { CoverImage } from 'src/models/novel';

const { t } = useI18n();

defineProps<{
  cover: CoverImage;
  info: { width: number; height: number; size?: number } | null;
}>();

const emit = defineEmits<{
  'copy-url': [];
}>();
</script>
