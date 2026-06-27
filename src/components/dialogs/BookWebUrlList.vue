<template>
  <div v-if="urls && urls.length > 0" class="space-y-1 mt-2">
    <div v-for="(url, index) in urls" :key="index" class="flex items-center gap-2 p-2 card-base">
      <a
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-accent-400 hover:text-accent-300 hover:underline text-sm break-all flex-1 transition-colors"
      >
        {{ url }}
      </a>
      <Button
        v-if="isUrlScrapable(url)"
        icon="pi pi-download"
        class="p-button-text p-button-sm"
        size="small"
        title="爬取此 URL 的内容"
        @click="emit('scrape', url)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import { NovelScraperFactory } from 'src/services/scraper';

defineProps<{
  urls?: string[] | undefined;
}>();

const emit = defineEmits<{
  scrape: [url: string];
}>();

// 判断 URL 是否来自支持的爬取站点
const isUrlScrapable = (url: string): boolean => NovelScraperFactory.isValidUrl(url);
</script>
