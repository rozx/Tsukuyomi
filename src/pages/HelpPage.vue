<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import { marked, type Token } from 'marked';
import DOMPurify from 'dompurify';

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

const documents = ref<HelpDocument[]>([]);
const currentDoc = ref<HelpDocument | null>(null);
const content = ref('');
const loading = ref(false);
const error = ref('');
const toc = ref<TocItem[]>([]);
const activeHeading = ref<string>('');

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
    groups[doc.category].push(doc);
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

  if (href.startsWith('./') || href.startsWith('../')) {
    return `<a href="${href}" class="doc-link" onclick="event.preventDefault(); window.loadHelpDoc('${href}')">${text}</a>`;
  }

  return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="doc-link doc-link-external" title="${title}">${text}<i class="pi pi-external-link ml-1 text-xs opacity-70"></i></a>`;
};

async function loadDocumentIndex() {
  try {
    const response = await fetch('/help/index.json');
    if (!response.ok) throw new Error('Failed to load document index');
    documents.value = (await response.json()) as HelpDocument[];

    // Expand all categories by default
    const categories = new Set(documents.value.map((doc) => doc.category));
    expandedCategories.value = categories;

    if (documents.value.length > 0 && !currentDoc.value) {
      const firstDoc = documents.value[0];
      if (firstDoc) {
        await loadDocument(firstDoc);
      }
    }
  } catch {
    error.value = '无法加载帮助文档索引';
  }
}

async function loadDocument(doc: HelpDocument) {
  if (currentDoc.value?.id === doc.id) return;

  loading.value = true;
  error.value = '';
  currentDoc.value = doc;
  toc.value = [];
  activeHeading.value = '';

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
    toc.value = headings.filter((h) => h.level > 1 && h.level < 4);

    // Render markdown
    const html = await marked.parse(markdown, { renderer });
    content.value = DOMPurify.sanitize(html);

    nextTick(() => {
      const container = document.querySelector('.help-content-scroll');
      if (container) container.scrollTop = 0;
    });
  } catch {
    error.value = `无法加载文档: ${doc.title}`;
  } finally {
    loading.value = false;
  }
}

function scrollToHeading(id: string) {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    activeHeading.value = id;
  }
}

// Internal link handling
(window as unknown as { loadHelpDoc: (href: string) => void }).loadHelpDoc = (href: string) => {
  const docId = href.replace('./', '').replace('.md', '');
  const doc = documents.value.find((d) => d.id === docId || d.file === href.replace('./', ''));
  if (doc) {
    void loadDocument(doc);
  }
};

onMounted(() => {
  void loadDocumentIndex();
});
</script>

<template>
  <div class="w-full h-full flex">
    <!-- Left Sidebar - Navigation -->
    <aside class="w-64 flex-shrink-0 border-r border-white/10 flex flex-col bg-night-900/40">
      <div class="p-4 border-b border-white/10">
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

      <nav class="flex-1 overflow-y-auto p-3 space-y-2">
        <div v-for="(docs, category) in groupedDocuments" :key="category" class="mb-2">
          <button
            @click="toggleCategory(category as string)"
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <h3
              class="text-xs font-semibold text-moon/50 uppercase tracking-wider group-hover:text-moon/70 transition-colors"
            >
              {{ category }}
            </h3>
            <i
              class="pi text-moon/40 text-xs transition-transform duration-200"
              :class="
                expandedCategories.has(category as string) ? 'pi-chevron-down' : 'pi-chevron-right'
              "
            ></i>
          </button>
          <ul v-show="expandedCategories.has(category as string)" class="space-y-0.5 mt-1">
            <li v-for="doc in docs" :key="doc.id">
              <button
                @click="loadDocument(doc)"
                class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                :class="
                  currentDoc?.id === doc.id
                    ? 'bg-primary/20 text-primary font-medium'
                    : 'text-moon/80 hover:bg-white/5 hover:text-moon-100'
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
    <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
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
      <div v-else class="flex-1 flex overflow-hidden">
        <!-- Content Area -->
        <div class="flex-1 overflow-y-auto help-content-scroll">
          <div class="max-w-3xl mx-auto px-8 py-10">
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
            <article class="doc-content" v-html="content"></article>
          </div>
        </div>

        <!-- Right Sidebar - TOC -->
        <aside
          v-if="toc.length > 0"
          class="w-56 flex-shrink-0 border-l border-white/10 hidden xl:block"
        >
          <div class="sticky top-0 p-4">
            <h3 class="text-xs font-semibold text-moon/50 uppercase tracking-wider mb-4">目录</h3>
            <nav class="space-y-1">
              <a
                v-for="item in toc"
                :key="item.id"
                :href="`#${item.id}`"
                @click.prevent="scrollToHeading(item.id)"
                class="block text-sm py-1.5 transition-colors border-l-2 -ml-px"
                :class="[
                  activeHeading === item.id
                    ? 'text-primary border-primary pl-3'
                    : 'text-moon/60 border-transparent hover:text-moon/90 hover:border-moon/30 pl-3',
                  item.level > 2 ? 'ml-3' : '',
                ]"
              >
                {{ item.text }}
              </a>
            </nav>
          </div>
        </aside>
      </div>
    </main>
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
