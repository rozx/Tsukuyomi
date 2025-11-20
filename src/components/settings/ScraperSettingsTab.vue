<script setup lang="ts">
import InputNumber from 'primevue/inputnumber';
import { useSettingsStore } from 'src/stores/settings';

const settingsStore = useSettingsStore();
</script>

<template>
  <div class="p-4 space-y-3">
    <div>
      <h3 class="text-sm font-medium text-moon/90 mb-1">爬虫设置</h3>
      <p class="text-xs text-moon/70">配置爬虫的并发请求数量，避免超过 API 限制</p>
    </div>
    <div class="space-y-2">
      <label class="text-xs text-moon/80">并发数限制 (1-10)</label>
      <InputNumber
        :model-value="settingsStore.scraperConcurrencyLimit"
        :min="1"
        :max="10"
        :show-buttons="true"
        class="w-full"
        @update:model-value="
          (value) => settingsStore.setScraperConcurrencyLimit(Number(value))
        "
      />
      <p class="text-xs text-moon/60">同时进行的请求数量，建议值：3</p>
    </div>
  </div>
</template>

