import { ref, onMounted, computed, nextTick, watch, inject, provide, type InjectionKey } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked, type Token } from 'marked';
import DOMPurify from 'dompurify';
import { useResponsiveLayout } from 'src/composables/useResponsiveLayout';
import { resolveHelpDocumentByHref } from 'src/utils/help-navigation';
import { getAssetUrl } from 'src/utils/assets';

export interface HelpDocument {
  id: string;
  title: string;
  file: string;
  path: string;
  category: string;
  description: string;
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export type HelpPageContext = ReturnType<typeof createHelpPageContext>;

const HELP_PAGE_KEY: InjectionKey<HelpPageContext> = Symbol('help-page');

export function provideHelpPage(): HelpPageContext {
  const ctx = createHelpPageContext();
  provide(HELP_PAGE_KEY, ctx);
  return ctx;
}

export function injectHelpPage(): HelpPageContext {
  const ctx = inject(HELP_PAGE_KEY);
  if (!ctx) {
    throw new Error(
      'injectHelpPage() called outside a HelpPage dispatcher — ensure the variant is mounted by HelpPage.vue.',
    );
  }
  return ctx;
}

function createHelpPageContext() {
  const route = useRoute();
  const router = useRouter();
  const { isPhone, isTablet } = useResponsiveLayout();

  const documents = ref<HelpDocument[]>([]);
  const currentDoc = ref<HelpDocument | null>(null);
  const content = ref('');
  const loading = ref(false);
  const error = ref('');
  const toc = ref<TocItem[]>([]);
  const activeHeading = ref<string>('');
  const showDocumentNavDrawer = ref(false);
  const showTocDrawer = ref(false);

  const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

  const quickStartSteps = [
    { n: '01', t: '配置您的 AI 模型', d: '在 AI 设置中输入一个或多个服务商的密钥。' },
    { n: '02', t: '导入或添加书籍', d: '从 syosetu / kakuyomu 抓取，或手动添加。' },
    { n: '03', t: '建立术语与角色', d: '让 AI 理解「月詠」、「白銀の騎士」等专有名词。' },
    { n: '04', t: '开始翻译', d: '单段翻译或批量翻译；多模型多版本自由切换。' },
  ];

  const helpTopicsByKeyword: Array<{ icon: string; label: string; keywords: string[] }> = [
    { icon: 'pi-book', label: '图书馆', keywords: ['图书', '库', '书籍'] },
    { icon: 'pi-file-edit', label: '翻译功能', keywords: ['翻译'] },
    { icon: 'pi-tags', label: '术语管理', keywords: ['术语'] },
    { icon: 'pi-users', label: '角色设定', keywords: ['角色'] },
    { icon: 'pi-objects-column', label: '记忆系统', keywords: ['记忆', '记忆库'] },
    { icon: 'pi-sparkles', label: 'AI 助手', keywords: ['助手', 'AI'] },
  ];

  const topicTiles = computed(() =>
    helpTopicsByKeyword.map((topic) => {
      const match = documents.value.find((d) =>
        topic.keywords.some(
          (k) => d.title.includes(k) || d.description.includes(k) || d.category.includes(k),
        ),
      );
      return { ...topic, doc: match };
    }),
  );

  const expandedCategories = ref<Set<string>>(new Set());

  function toggleCategory(category: string) {
    if (expandedCategories.value.has(category)) {
      expandedCategories.value.delete(category);
    } else {
      expandedCategories.value.add(category);
    }
    expandedCategories.value = new Set(expandedCategories.value);
  }

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
      return `<a href="${href}" class="doc-link" data-href="${href}">${text}</a>`;
    }

    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="doc-link doc-link-external" title="${title}">${text}<i class="pi pi-external-link ml-1 text-xs opacity-70"></i></a>`;
  };

  async function loadDocumentIndex() {
    try {
      const response = await fetch(getAssetUrl('help/index.json'));
      if (!response.ok) throw new Error('Failed to load document index');
      documents.value = (await response.json()) as HelpDocument[];

      const categories = new Set(documents.value.map((doc) => doc.category));
      categories.delete('更新日志');
      expandedCategories.value = categories;

      const docId = route.params.docId as string;
      if (docId) {
        const doc = documents.value.find((d) => d.id === docId);
        if (doc) {
          await loadDocumentContent(doc);
          return;
        }
      }

      // 桌面：不自动打开第一篇文档，保留品牌化的帮助中心入口态；
      // 平板：沿用之前的自动跳转行为（平板没有落地态模板，避免主内容空白）。
      if (isTablet.value && documents.value.length > 0 && !currentDoc.value) {
        const firstDoc = documents.value[0];
        if (firstDoc) {
          await router.replace(`/help/${firstDoc.id}`);
        }
      }

    } catch {
      error.value = '无法加载帮助文档索引';
    }
  }

  function navigateToDocument(doc: HelpDocument, hash = '') {
    const normalizedHash = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : '';
    void router.push(`/help/${doc.id}${normalizedHash}`);
    showDocumentNavDrawer.value = false;
  }

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

    if (!expandedCategories.value.has(doc.category)) {
      expandedCategories.value.add(doc.category);
      expandedCategories.value = new Set(expandedCategories.value);
    }

    try {
      const response = await fetch(getAssetUrl(`${doc.path}/${doc.file}`));
      if (!response.ok) throw new Error(`Failed to load ${doc.file}`);
      const markdown = await response.text();

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

      const html = await marked.parse(markdown, { renderer });
      content.value = DOMPurify.sanitize(html, {
        ADD_ATTR: ['data-href'],
      });

      await nextTick();
      const container = document.querySelector('.help-content-scroll');
      if (container) container.scrollTop = 0;

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
        router.replace({ ...route, hash: `#${id}` });
      }
    }
  }

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

  function handleContentClick(event: MouseEvent) {
    const target = event.target;
    if (!target || !(target instanceof HTMLElement)) return;

    const link = target.closest('a.doc-link');
    if (!link) return;

    if (!(link instanceof HTMLElement)) return;

    const href = link.getAttribute('data-href');
    if (!href) return;

    event.preventDefault();
    handleInternalLink(href);
  }

  onMounted(() => {
    void loadDocumentIndex();
  });

  return {
    // state
    documents,
    currentDoc,
    content,
    loading,
    error,
    toc,
    activeHeading,
    showDocumentNavDrawer,
    showTocDrawer,
    expandedCategories,
    // computed + static data
    logoPath,
    quickStartSteps,
    topicTiles,
    groupedDocuments,
    // actions
    loadDocumentIndex,
    navigateToDocument,
    toggleCategory,
    scrollToHeading,
    handleContentClick,
  };
}
