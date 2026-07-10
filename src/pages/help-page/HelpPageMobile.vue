<script setup lang="ts">
import { computed } from 'vue';
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import { APP_NAME } from 'src/constants/app';
import HelpMobileLanding from './HelpMobileLanding.vue';
import HelpMobileDrawers from './HelpMobileDrawers.vue';

const ctx = injectHelpPage();

// 把模板内的三元 / 比较 / && / 可选链收进脚本侧，降低段落认知与圈复杂度
const hasToc = computed(() => ctx.toc.value.length > 0);
const currentDocCategory = computed(() => ctx.currentDoc.value?.category);
const currentDocTitle = computed(() => ctx.currentDoc.value?.title);
const currentDocDescription = computed(() => ctx.currentDoc.value?.description);
</script>

<template>
  <div class="w-full h-full flex overflow-hidden relative">
    <main class="flex-1 h-full flex flex-col min-w-0">
      <!-- 手机端顶部工具栏 -->
      <div
        class="px-3 py-2 border-b border-white/10 flex items-center justify-between bg-night-900/30"
      >
        <button
          class="px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-moon/90"
          @click="ctx.showDocumentNavDrawer.value = true"
        >
          <i class="pi pi-bars mr-1" /> 文档
        </button>
        <button
          v-if="hasToc"
          class="px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-moon/90"
          @click="ctx.showTocDrawer.value = true"
        >
          <i class="pi pi-list mr-1" /> 目录
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="ctx.loading.value" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <i class="pi pi-spin pi-spinner text-3xl text-primary mb-4" />
          <p class="text-moon/60">加载文档中...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="ctx.error.value" class="flex-1 flex items-center justify-center">
        <div class="text-center p-8 bg-red-500/10 rounded-xl border border-red-500/20 max-w-md">
          <i class="pi pi-exclamation-triangle text-3xl text-red-400 mb-4" />
          <p class="text-red-300 mb-4">{{ ctx.error.value }}</p>
          <button
            class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
            @click="ctx.loadDocumentIndex"
          >
            重试
          </button>
        </div>
      </div>

      <!-- 手机端 · 帮助中心落地页（未选中文档时显示，抽出到 HelpMobileLanding） -->
      <HelpMobileLanding v-else-if="!ctx.currentDoc.value" />

      <!-- Document Content -->
      <div v-else class="flex-1 h-full flex overflow-hidden">
        <div class="flex-1 h-full overflow-y-auto help-content-scroll">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
            <header class="mb-10">
              <div class="flex items-center gap-2 text-sm text-primary mb-3">
                <span>{{ currentDocCategory }}</span>
                <i class="pi pi-angle-right text-xs opacity-50" />
                <span>{{ currentDocTitle }}</span>
              </div>
              <h1
                class="font-display text-3xl font-semibold tracking-tight text-moon-100 leading-tight mb-4"
              >
                {{ currentDocTitle }}
              </h1>
              <p
                v-if="currentDocDescription"
                class="text-lg text-moon/70 leading-relaxed"
              >
                {{ currentDocDescription }}
              </p>
            </header>

            <article
              class="doc-content"
              v-html="ctx.content.value"
              @click="ctx.handleContentClick"
            />
          </div>
        </div>
      </div>
    </main>

    <!-- 文档抽屉 + TOC 抽屉（抽出到 HelpMobileDrawers） -->
    <HelpMobileDrawers />
  </div>
</template>

<style scoped>
/* 文档正文样式抽到 ./doc-content.css，见下方 `<style scoped src>` */
</style>

<!-- 文档正文共享样式，scoped src 会重新作用到本组件作用域 -->
<style scoped src="./doc-content.css"></style>
