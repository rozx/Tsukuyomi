<template>
  <div v-if="showUrlSection" class="space-y-2 flex-shrink-0 w-full min-w-0">
    <label class="block text-sm font-medium text-moon/90">小说 URL</label>
    <div class="scraper-url-row flex gap-2 min-w-0">
      <InputText
        v-model="urlInput"
        :placeholder="`输入 ${supportedSitesText} 的小说 URL`"
        class="flex-1"
        :class="{ 'p-invalid': urlInvalid }"
        @keyup.enter="handleFetch"
      />
      <Button
        label="获取"
        icon="pi pi-search"
        :loading="loading"
        :disabled="fetchDisabled"
        @click="handleFetch"
      />
    </div>
    <small v-if="urlInvalid" class="p-error block">
      请输入支持的小说网站 URL（当前支持：{{ supportedSitesText }} ）
    </small>
    <div v-if="showSupportedSites" class="flex items-center gap-2 flex-wrap">
      <small class="text-moon/60">支持的网站：</small>
      <div class="flex gap-2 flex-wrap">
        <span v-for="site in supportedSites" :key="site" class="site-badge">
          {{ site }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const {
  urlInput,
  loading,
  isValidUrl,
  handleFetch,
  supportedSites,
  supportedSitesText,
  isPhone,
  mobileShowPreview,
  scrapedNovel,
} = inject(SCRAPER_DIALOG_KEY)!;

// URL 输入区仅在非手机、或手机端未进入预览时显示
const showUrlSection = computed(() => !isPhone.value || !mobileShowPreview.value);
// 当前输入无效（已输入但不支持）
const urlInvalid = computed(() => !!urlInput.value && !isValidUrl.value);
// 获取按钮禁用条件
const fetchDisabled = computed(() => !isValidUrl.value || loading.value);
// 支持站点提示的显示条件
const showSupportedSites = computed(() => !isPhone.value || !scrapedNovel.value);
</script>

<style scoped>
/* URL 输入行的手机端样式。
 * 注：从 NovelScraperDialog.vue 迁移而来 —— 父对话框把 URL 输入区抽成本组件后，
 * .scraper-url-row 渲染在本组件内部嵌套元素，父级 scoped 样式无法命中（子组件携带自身 scope id）。 */
@media (max-width: 640px) {
  .scraper-url-row {
    flex-direction: column;
    gap: 0.5rem;
  }

  .scraper-url-row :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }
}
</style>
