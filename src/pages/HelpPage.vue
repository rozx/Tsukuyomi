<script setup lang="ts">
import { ref, onMounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked, type Token } from 'marked';
import DOMPurify from 'dompurify';
import { useUiStore } from 'src/stores/ui';
import { resolveHelpDocumentByHref } from 'src/utils/help-navigation';

interface HelpDocument {
  id: string;
  title: string;
  file: string;
  path: string;
  category: string;
  description: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

const route = useRoute();
const router = useRouter();
const uiStore = useUiStore();

const documents = ref<HelpDocument[]>([]);
const currentDoc = ref<HelpDocument | null>(null);
const content = ref('');
const loading = ref(false);
const error = ref('');
const toc = ref<TocItem[]>([]);
const activeHeading = ref<string>('');
const showDocumentNavDrawer = ref(false);
const showTocDrawer = ref(false);
const isPhone = computed(() => uiStore.deviceType === 'phone');

// Track which categories are expanded (all expanded by default)
const expandedCategories = ref<Set<string>>(new Set());

// Toggle category expansion
function toggleCategory(category: string) {
  if (expandedCategories.value.has(category)) {
    expandedCategories.value.delete(category);
  } else {
    expandedCategories.value.add(category);
  }
  // Trigger reactivity
  expandedCategories.value = new Set(expandedCategories.value);
}

// Group documents by category
const groupedDocuments = computed(() => {
  const groups: Record<string, HelpDocument[]> = {};
  for (const doc of documents.value) {
    if (!groups[doc.category]) {
      groups[doc.category] = [];
    }
    groups[doc.category]!.push(doc);
  }
  return groups;
});

// Custom renderer for markdown
const renderer = new marked.Renderer();
renderer.heading = (token: Token) => {
  if (token.type !== 'heading') return '';
  const headingToken = token as Token & { depth: number; text: string; raw: string };
  const text = headingToken.text;
  const level = headingToken.depth;
  const raw = headingToken.raw.replace(/^#+\s*/, '');
  const anchor = raw
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `<h${level} id="${anchor}" class="doc-heading doc-heading-${level}">${text}</h${level}>`;
};

renderer.link = (token: Token) => {
  if (token.type !== 'link') return '';
  const linkToken = token as Token & { href: string; title?: string; text: string };
  const href = linkToken.href;
  const title = linkToken.title || '';
  const text = linkToken.text;

  if (href.startsWith('./') || href.startsWith('../') || href.startsWith('#')) {
    // 内部链接：使用 data-href 属性存储链接，通过事件委托处理
    // DOMPurify 会自动处理 HTML 实体编码，确保安全
    return `<a href="${href}" class="doc-link" data-href="${href}">${text}</a>`;
  }

  return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="doc-link doc-link-external" title="${title}">${text}<i class="pi pi-external-link ml-1 text-xs opacity-70"></i></a>`;
};

async function loadDocumentIndex() {
  try {
    const response = await fetch('/help/index.json');
    if (!response.ok) throw new Error('Failed to load document index');
    documents.value = (await response.json()) as HelpDocument[];

    // Expand all categories by default except "更新日志"
    const categories = new Set(documents.value.map((doc) => doc.category));
    categories.delete('更新日志'); // Collapse changelog by default
    expandedCategories.value = categories;

    // Initial load handling
    const docId = route.params.docId as string;
    if (docId) {
      const doc = documents.value.find((d) => d.id === docId);
      if (doc) {
        await loadDocumentContent(doc);
        return;
      }
    }

    // Default to first doc if no route param or not found
    if (documents.value.length > 0 && !currentDoc.value) {
      const firstDoc = documents.value[0];
      if (firstDoc) {
        // Replace current route with the default doc ID so URL is consistent
        await router.replace(`/help/${firstDoc.id}`);
        // The watcher will handle loading, or we can load directly if watcher doesn't fire on replace (it usually does)
      }
    }
  } catch {
    error.value = '无法加载帮助文档索引';
  }
}

// Navigate to document (updates route)
function navigateToDocument(doc: HelpDocument, hash = '') {
  const normalizedHash = hash
    ? hash.startsWith('#')
      ? hash
      : `#${hash}`
    : '';
  void router.push(`/help/${doc.id}${normalizedHash}`);
  showDocumentNavDrawer.value = false;
}

// Create a watcher for the route parameter
watch(
  () => route.params.docId,
  async (newId) => {
    if (newId && typeof newId === 'string' && documents.value.length > 0) {
      const doc = documents.value.find((d) => d.id === newId);
      if (doc) {
        await loadDocumentContent(doc);
      }
    }
  },
);

// Watch for hash changes (e.g. browser back/forward buttons)
watch(
  () => route.hash,
  (newHash) => {
    if (newHash) {
      scrollToHeading(newHash.substring(1), false);
    }
  },
);

watch(
  () => route.fullPath,
  () => {
    if (isPhone.value) {
      showDocumentNavDrawer.value = false;
      showTocDrawer.value = false;
    }
  },
);

async function loadDocumentContent(doc: HelpDocument) {
  if (currentDoc.value?.id === doc.id) {
    // If just hash changed (handled by watcher) or same doc, do nothing unless we need to scroll to hash from initial load logic overlap
    if (route.hash) {
      await nextTick();
      scrollToHeading(route.hash.substring(1), false);
    }
    return;
  }

  loading.value = true;
  error.value = '';
  currentDoc.value = doc;
  toc.value = [];
  activeHeading.value = '';

  // Ensure category is expanded
  if (!expandedCategories.value.has(doc.category)) {
    expandedCategories.value.add(doc.category);
    expandedCategories.value = new Set(expandedCategories.value);
  }

  try {
    const response = await fetch(`/${doc.path}/${doc.file}`);
    if (!response.ok) throw new Error(`Failed to load ${doc.file}`);
    const markdown = await response.text();

    // Parse TOC
    const tokens = marked.lexer(markdown);
    const headings: TocItem[] = [];
    tokens.forEach((token) => {
      if (token.type === 'heading') {
        const headingToken = token as Token & { depth: number; text: string; raw: string };
        const raw = headingToken.raw.replace(/^#+\s*/, '');
        const anchor = raw
          .toLowerCase()
          .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/^-+|-+$/g, '');

        headings.push({
          id: anchor,
          text: headingToken.text,
          level: headingToken.depth,
        });
      }
    });
    toc.value = headings.filter((h) => h.level >= 1 && h.level <= 4);

    // Render markdown
    const html = await marked.parse(markdown, { renderer });
    // 配置 DOMPurify 允许 data-href 属性
    content.value = DOMPurify.sanitize(html, {
      ADD_ATTR: ['data-href'],
    });

    await nextTick();
    const container = document.querySelector('.help-content-scroll');
    if (container) container.scrollTop = 0;

    // Scroll to hash if present
    if (route.hash) {
      setTimeout(() => {
        scrollToHeading(route.hash.substring(1), false);
      }, 100);
    }
  } catch {
    error.value = `无法加载文档: ${doc.title}`;
  } finally {
    loading.value = false;
  }
}

function scrollToHeading(id: string, updateUrl = true) {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    activeHeading.value = id;
    showTocDrawer.value = false;
    if (updateUrl) {
      // Use replace to avoid cluttering history, or push if navigation intention is strong
      // Using replace to keep it lighter for TOC scrolling
      router.replace({ ...route, hash: `#${id}` });
    }
  }
}

// 处理内部链接导航
function handleInternalLink(href: string) {
  const [pathPart, hashPart] = href.split('#', 2);

  if (!pathPart && hashPart) {
    scrollToHeading(hashPart);
    return;
  }

  const doc = resolveHelpDocumentByHref(documents.value, href);
  if (doc) {
    navigateToDocument(doc, hashPart ? `#${hashPart}` : '');
  }
}

// 事件委托：处理文档内容中的链接点击
function handleContentClick(event: MouseEvent) {
  const target = event.target;
  if (!target || !(target instanceof HTMLElement)) return;

  // 查找最近的 a 标签
  const link = target.closest('a.doc-link');
  if (!link) return;

  // 类型守卫：确保是 HTMLElement 以便调用 getAttribute
  if (!(link instanceof HTMLElement)) return;

  const href = link.getAttribute('data-href');
  if (!href) return; // 外部链接没有 data-href，由浏览器处理

  // 内部链接：阻止默认行为并使用路由处理
  event.preventDefault();
  handleInternalLink(href);
}

onMounted(() => {
  void loadDocumentIndex();
});
</script>

<template>
  <div class="w-full h-full flex overflow-hidden relative">
    <!-- Left Sidebar - Navigation -->
    <aside
      v-if="!isPhone"
      class="w-64 h-full flex-shrink-0 border-r border-white/10 flex flex-col bg-night-900/40"
    >
      <div class="p-4 border-b border-white/10 flex-shrink-0">
        <div class="flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center"
          >
            <i class="pi pi-book text-lg"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-moon-100">帮助中心</h2>
            <p class="text-xs text-moon/60">Documentation</p>
          </div>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto p-3 space-y-1">
        <div v-for="(docs, category) in groupedDocuments" :key="category" class="mb-3">
          <button
            @click="toggleCategory(category as string)"
            class="w-full flex items-center justify-between px-2 py-1.5 transition-colors group"
          >
            <h3
              class="text-[10px] font-bold text-moon/40 uppercase tracking-widest group-hover:text-moon/60 transition-colors"
            >
              {{ category }}
            </h3>
            <i
              class="pi text-moon/30 text-[10px] transition-transform duration-200"
              :class="
                expandedCategories.has(category as string) ? 'pi-chevron-down' : 'pi-chevron-right'
              "
            ></i>
          </button>
          <ul v-show="expandedCategories.has(category as string)" class="space-y-0.5 mt-1.5">
            <li v-for="doc in docs" :key="doc.id">
              <button
                @click="navigateToDocument(doc)"
                class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 border-l-2"
                :class="
                  currentDoc?.id === doc.id
                    ? 'bg-primary/20 text-primary font-medium border-primary shadow-sm'
                    : 'text-moon/80 hover:bg-white/5 hover:text-moon-100 border-transparent hover:border-moon/20'
                "
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
      <div
        v-if="isPhone"
        class="px-3 py-2 border-b border-white/10 flex items-center justify-between bg-night-900/30"
      >
        <button
          class="px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-moon/90"
          @click="showDocumentNavDrawer = true"
        >
          <i class="pi pi-bars mr-1"></i> 文档
        </button>
        <button
          v-if="toc.length > 0"
          class="px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-moon/90"
          @click="showTocDrawer = true"
        >
          <i class="pi pi-list mr-1"></i> 目录
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <i class="pi pi-spin pi-spinner text-3xl text-primary mb-4"></i>
          <p class="text-moon/60">加载文档中...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex-1 flex items-center justify-center">
        <div class="text-center p-8 bg-red-500/10 rounded-xl border border-red-500/20 max-w-md">
          <i class="pi pi-exclamation-triangle text-3xl text-red-400 mb-4"></i>
          <p class="text-red-300 mb-4">{{ error }}</p>
          <button
            @click="loadDocumentIndex"
            class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      </div>

      <!-- Document Content -->
      <div v-else class="flex-1 h-full flex overflow-hidden">
        <!-- Left TOC Sidebar -->
        <aside
          v-if="toc.length > 0 && !isPhone"
          class="w-60 h-full flex-shrink-0 border-r border-white/10 bg-night-900/20 flex flex-col"
        >
          <div class="p-5 border-b border-white/10 flex-shrink-0">
            <div class="flex items-center gap-2">
              <i class="pi pi-list text-primary text-sm"></i>
              <h3 class="text-xs font-bold text-moon/50 uppercase tracking-wider">目录</h3>
            </div>
          </div>
          <nav class="flex-1 overflow-y-auto p-5 space-y-0.5">
            <a
              v-for="item in toc"
              :key="item.id"
              :href="`#${item.id}`"
              @click.prevent="scrollToHeading(item.id)"
              class="block py-2 px-3 rounded-lg transition-all duration-200 border-l-2 -ml-px"
              :class="[
                // Active state
                activeHeading === item.id
                  ? 'text-primary border-primary bg-primary/10 font-medium'
                  : 'text-moon/60 border-transparent hover:text-moon-100 hover:bg-white/5 hover:border-moon/20',
                // Level-specific styles
                item.level === 1 ? 'text-base font-semibold' : '',
                item.level === 2 ? 'text-sm font-medium ml-2' : '',
                item.level === 3 ? 'text-xs ml-6 opacity-90' : '',
                item.level === 4 ? 'text-xs ml-8 opacity-75' : '',
              ]"
            >
              <span
                v-if="item.level === 1"
                class="inline-block w-1 h-1 rounded-full bg-primary mr-2"
              ></span>
              {{ item.text }}
            </a>
          </nav>
        </aside>

        <!-- Content Area -->
        <div class="flex-1 h-full overflow-y-auto help-content-scroll">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
            <!-- Header -->
            <header class="mb-10">
              <div class="flex items-center gap-2 text-sm text-primary mb-3">
                <span>{{ currentDoc?.category }}</span>
                <i class="pi pi-angle-right text-xs opacity-50"></i>
                <span>{{ currentDoc?.title }}</span>
              </div>
              <h1 class="text-3xl font-bold text-moon-100 mb-4">{{ currentDoc?.title }}</h1>
              <p v-if="currentDoc?.description" class="text-lg text-moon/70 leading-relaxed">
                {{ currentDoc?.description }}
              </p>
            </header>

            <!-- Document Body -->
            <article class="doc-content" v-html="content" @click="handleContentClick"></article>
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="isPhone && showDocumentNavDrawer"
      class="absolute inset-0 z-40 bg-black/45"
      @click="showDocumentNavDrawer = false"
    />
    <aside
      v-if="isPhone"
      class="absolute top-0 left-0 bottom-0 z-50 w-[82vw] max-w-[20rem] border-r border-white/10 flex flex-col bg-night-900/95 transition-transform duration-200"
      :class="showDocumentNavDrawer ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="p-4 border-b border-white/10 flex-shrink-0 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="pi pi-book text-primary"></i>
          <span class="text-sm font-semibold text-moon-100">帮助文档</span>
        </div>
        <button class="text-moon/70" @click="showDocumentNavDrawer = false">
          <i class="pi pi-times"></i>
        </button>
      </div>
      <nav class="flex-1 overflow-y-auto p-3 space-y-1">
        <div v-for="(docs, category) in groupedDocuments" :key="category" class="mb-3">
          <button
            @click="toggleCategory(category as string)"
            class="w-full flex items-center justify-between px-2 py-1.5 transition-colors group"
          >
            <h3
              class="text-[10px] font-bold text-moon/40 uppercase tracking-widest group-hover:text-moon/60 transition-colors"
            >
              {{ category }}
            </h3>
            <i
              class="pi text-moon/30 text-[10px] transition-transform duration-200"
              :class="
                expandedCategories.has(category as string) ? 'pi-chevron-down' : 'pi-chevron-right'
              "
            ></i>
          </button>
          <ul v-show="expandedCategories.has(category as string)" class="space-y-0.5 mt-1.5">
            <li v-for="doc in docs" :key="doc.id">
              <button
                @click="navigateToDocument(doc)"
                class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 border-l-2"
                :class="
                  currentDoc?.id === doc.id
                    ? 'bg-primary/20 text-primary font-medium border-primary shadow-sm'
                    : 'text-moon/80 hover:bg-white/5 hover:text-moon-100 border-transparent hover:border-moon/20'
                "
              >
                {{ doc.title }}
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </aside>

    <div
      v-if="isPhone && showTocDrawer && toc.length > 0"
      class="absolute inset-0 z-40 bg-black/45"
      @click="showTocDrawer = false"
    />
    <aside
      v-if="isPhone && toc.length > 0"
      class="absolute top-0 right-0 bottom-0 z-50 w-[80vw] max-w-[20rem] border-l border-white/10 bg-night-900/95 flex flex-col transition-transform duration-200"
      :class="showTocDrawer ? 'translate-x-0' : 'translate-x-full'"
    >
      <div class="p-4 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="pi pi-list text-primary"></i>
          <span class="text-sm font-semibold text-moon-100">目录</span>
        </div>
        <button class="text-moon/70" @click="showTocDrawer = false">
          <i class="pi pi-times"></i>
        </button>
      </div>
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <a
          v-for="item in toc"
          :key="item.id"
          :href="`#${item.id}`"
          @click.prevent="scrollToHeading(item.id)"
          class="block py-2 px-3 rounded-lg transition-all duration-200 border-l-2"
          :class="[
            activeHeading === item.id
              ? 'text-primary border-primary bg-primary/10 font-medium'
              : 'text-moon/60 border-transparent hover:text-moon-100 hover:bg-white/5 hover:border-moon/20',
            item.level === 1 ? 'text-base font-semibold' : '',
            item.level === 2 ? 'text-sm font-medium ml-2' : '',
            item.level === 3 ? 'text-xs ml-6 opacity-90' : '',
            item.level === 4 ? 'text-xs ml-8 opacity-75' : '',
          ]"
        >
          {{ item.text }}
        </a>
      </nav>
    </aside>
  </div>
</template>

<style scoped>
/* Document Content Styles */
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
