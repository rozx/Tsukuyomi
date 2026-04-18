<script setup lang="ts">
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';

const ctx = injectHelpPage();
</script>

<template>
  <div class="w-full h-full flex overflow-hidden relative">
    <!-- Left Sidebar - Navigation -->
    <aside
      class="w-64 h-full flex-shrink-0 border-r border-white/10 flex flex-col bg-night-900/40"
    >
      <div class="p-4 border-b border-white/10 flex-shrink-0">
        <div class="flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center"
          >
            <i class="pi pi-book text-lg" />
          </div>
          <div>
            <h2 class="font-display text-base font-semibold text-moon-100">帮助中心</h2>
            <p class="text-xs text-moon/60">Documentation</p>
          </div>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto p-3 space-y-1">
        <div v-for="(docs, category) in ctx.groupedDocuments.value" :key="category" class="mb-3">
          <button
            class="w-full flex items-center justify-between px-2 py-1.5 transition-colors group"
            @click="ctx.toggleCategory(category as string)"
          >
            <h3
              class="font-ui font-medium text-[11px] uppercase tracking-[0.2em] text-moon/60 group-hover:text-moon-100 transition-colors"
            >
              {{ category }}
            </h3>
            <i
              class="pi text-moon/30 text-[10px] transition-transform duration-200"
              :class="
                ctx.expandedCategories.value.has(category as string)
                  ? 'pi-chevron-down'
                  : 'pi-chevron-right'
              "
            />
          </button>
          <ul
            v-show="ctx.expandedCategories.value.has(category as string)"
            class="space-y-0.5 mt-1.5"
          >
            <li v-for="doc in docs" :key="doc.id">
              <button
                class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 border-l-2"
                :class="
                  ctx.currentDoc.value?.id === doc.id
                    ? 'bg-primary/20 text-primary font-medium border-primary shadow-sm'
                    : 'text-moon/80 hover:bg-white/5 hover:text-moon-100 border-transparent hover:border-moon/20'
                "
                @click="ctx.navigateToDocument(doc)"
              >
                {{ doc.title }}
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 h-full flex flex-col min-w-0">
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

      <!-- Document Content -->
      <div v-else class="flex-1 h-full flex overflow-hidden">
        <!-- Left TOC Sidebar -->
        <aside
          v-if="ctx.toc.value.length > 0"
          class="w-60 h-full flex-shrink-0 border-r border-white/10 bg-night-900/20 flex flex-col"
        >
          <div class="p-5 border-b border-white/10 flex-shrink-0">
            <div class="flex items-center gap-2">
              <i class="pi pi-list text-primary text-sm" />
              <h3
                class="font-ui font-medium text-[11px] uppercase tracking-[0.2em] text-moon/60"
              >
                目录
              </h3>
            </div>
          </div>
          <nav class="flex-1 overflow-y-auto p-5 space-y-0.5">
            <a
              v-for="item in ctx.toc.value"
              :key="item.id"
              :href="`#${item.id}`"
              class="block py-2 px-3 rounded-lg transition-all duration-200 border-l-2 -ml-px"
              :class="[
                ctx.activeHeading.value === item.id
                  ? 'text-primary border-primary bg-primary/10 font-medium'
                  : 'text-moon/60 border-transparent hover:text-moon-100 hover:bg-white/5 hover:border-moon/20',
                item.level === 1 ? 'text-base font-semibold' : '',
                item.level === 2 ? 'text-sm font-medium ml-2' : '',
                item.level === 3 ? 'text-xs ml-6 opacity-90' : '',
                item.level === 4 ? 'text-xs ml-8 opacity-75' : '',
              ]"
              @click.prevent="ctx.scrollToHeading(item.id)"
            >
              <span
                v-if="item.level === 1"
                class="inline-block w-1 h-1 rounded-full bg-primary mr-2"
              />
              {{ item.text }}
            </a>
          </nav>
        </aside>

        <!-- Content Area -->
        <div class="flex-1 h-full overflow-y-auto help-content-scroll">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
            <header class="mb-10">
              <div class="flex items-center gap-2 text-sm text-primary mb-3">
                <span>{{ ctx.currentDoc.value?.category }}</span>
                <i class="pi pi-angle-right text-xs opacity-50" />
                <span>{{ ctx.currentDoc.value?.title }}</span>
              </div>
              <h1
                class="font-display text-[30px] sm:text-[40px] font-semibold tracking-tight text-moon-100 leading-tight mb-4"
              >
                {{ ctx.currentDoc.value?.title }}
              </h1>
              <p
                v-if="ctx.currentDoc.value?.description"
                class="text-lg text-moon/70 leading-relaxed"
              >
                {{ ctx.currentDoc.value?.description }}
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
  </div>
</template>

<style scoped>
.doc-content {
  color: rgb(var(--moon-rgb) / 0.85);
  line-height: 1.75;
}

.doc-content :deep(p) {
  margin-bottom: 1.25rem;
}

.doc-content :deep(.doc-heading) {
  color: rgb(var(--moon-100-rgb));
  font-weight: 700;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
  scroll-margin-top: 2rem;
}

.doc-content :deep(.doc-heading-1) {
  font-size: 2rem;
  line-height: 1.2;
  margin-top: 0;
}

.doc-content :deep(.doc-heading-2) {
  font-size: 1.5rem;
  line-height: 1.3;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgb(255 255 255 / 0.1);
}

.doc-content :deep(.doc-heading-3) {
  font-size: 1.25rem;
  line-height: 1.4;
}

.doc-content :deep(.doc-link) {
  color: rgb(var(--primary-rgb));
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.15s;
}

.doc-content :deep(.doc-link:hover) {
  text-decoration: underline;
  opacity: 0.85;
}

.doc-content :deep(code) {
  background: rgb(255 255 255 / 0.08);
  color: rgb(var(--primary-rgb));
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.doc-content :deep(pre) {
  background: rgb(0 0 0 / 0.3);
  border: 1px solid rgb(255 255 255 / 0.1);
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  margin: 1.5rem 0;
}

.doc-content :deep(pre code) {
  background: none;
  padding: 0;
  color: rgb(var(--moon-rgb) / 0.9);
}

.doc-content :deep(blockquote) {
  border-left: 4px solid rgb(var(--primary-rgb));
  background: rgb(var(--primary-rgb) / 0.08);
  margin: 1.5rem 0;
  padding: 1rem 1.5rem;
  border-radius: 0 0.5rem 0.5rem 0;
}

.doc-content :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.doc-content :deep(ul),
.doc-content :deep(ol) {
  padding-left: 1.5rem;
  margin-bottom: 1.25rem;
}

.doc-content :deep(li) {
  margin-bottom: 0.5rem;
}

.doc-content :deep(ul li) {
  list-style-type: disc;
}

.doc-content :deep(ul li::marker) {
  color: rgb(var(--primary-rgb));
}

.doc-content :deep(ol li) {
  list-style-type: decimal;
}

.doc-content :deep(strong) {
  color: rgb(var(--moon-100-rgb));
  font-weight: 600;
}

.doc-content :deep(hr) {
  border: none;
  border-top: 1px solid rgb(255 255 255 / 0.1);
  margin: 2rem 0;
}

.doc-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
}

.doc-content :deep(th),
.doc-content :deep(td) {
  border: 1px solid rgb(255 255 255 / 0.1);
  padding: 0.75rem 1rem;
  text-align: left;
}

.doc-content :deep(th) {
  background: rgb(255 255 255 / 0.05);
  font-weight: 600;
  color: rgb(var(--moon-100-rgb));
}

.doc-content :deep(img) {
  max-width: 100%;
  border-radius: 0.5rem;
  border: 1px solid rgb(255 255 255 / 0.1);
}
</style>
