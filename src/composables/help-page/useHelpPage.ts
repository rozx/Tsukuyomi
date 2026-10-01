import { translateText } from 'src/i18n/translate';
import type { MessageKey } from 'src/i18n/types';
import { useI18n } from 'vue-i18n';
import { resolveAppLocale } from 'src/models/locale';
import { HelpService, parseHelpHeading, resolveHelpSection } from 'src/services/help-service';
import {
  ref,
  onMounted,
  onUnmounted,
  computed,
  nextTick,
  watch,
  inject,
  provide,
  type InjectionKey,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked, type Token } from 'marked';
import DOMPurify from 'dompurify';
import { useDeviceVariant } from 'src/composables/useDeviceVariant';
import { localizedErrorMessage } from 'src/utils/localized-error';
import type { HelpDocument, HelpHeading } from 'src/models/help';
import { resolveHelpDocumentByHref } from 'src/utils/help-navigation';
import { getAssetUrl } from 'src/utils/assets';

export type { HelpDocument } from 'src/models/help';
export type TocItem = HelpHeading;
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
  const { locale } = useI18n();
  const uiLocale = computed(() => resolveAppLocale(locale.value));
  const router = useRouter();
  const { variant } = useDeviceVariant();
  const isPhone = computed(() => variant.value === 'mobile');
  const isTablet = computed(() => variant.value === 'tablet');

  let indexRequest = 0;
  let documentRequest = 0;
  let disposed = false;
  let categoriesInitialized = false;
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

  const quickStartSteps = computed(() =>
    [
      ['configureTitle', 'configureDescription'],
      ['importTitle', 'importDescription'],
      ['referencesTitle', 'referencesDescription'],
      ['translateTitle', 'translateDescription'],
    ].map(([title, description], index) => ({
      n: String(index + 1).padStart(2, '0'),
      t: translateText(uiLocale.value, `helpUi.${title}` as MessageKey),
      d: translateText(uiLocale.value, `helpUi.${description}` as MessageKey),
    })),
  );
  const topicTiles = computed(() =>
    [
      ['books-page-guide', 'pi-book', 'library'],
      ['book-details-translation', 'pi-file-edit', 'translation'],
      ['book-details-terminology', 'pi-tags', 'terminology'],
      ['book-details-characters', 'pi-users', 'characters'],
      ['book-details-memory', 'pi-objects-column', 'memories'],
      ['chat-assistant-guide', 'pi-sparkles', 'assistant'],
    ].map(([id, icon, label]) => ({
      id,
      icon,
      label: translateText(uiLocale.value, `helpUi.${label}` as MessageKey),
      doc: documents.value.find((doc) => doc.id === id),
    })),
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
      if (!groups[doc.categoryId ?? 'guides']) {
        groups[doc.categoryId ?? 'guides'] = [];
      }
      groups[doc.categoryId ?? 'guides']!.push(doc);
    }
    return groups;
  });

  // 分类展开/选中态判定：被手机抽屉与平板导航列表共用，集中在此避免重复
  const categoryChevron = (category: string) =>
    expandedCategories.value.has(category) ? 'pi-chevron-down' : 'pi-chevron-right';
  const isCategoryExpanded = (category: string) => expandedCategories.value.has(category);
  const isActiveDoc = (doc: HelpDocument) => currentDoc.value?.id === doc.id;

  const renderer = new marked.Renderer();
  renderer.heading = (token: Token) => {
    if (token.type !== 'heading') return '';
    const headingToken = token as Token & { depth: number; text: string; raw: string };
    const text = headingToken.text;
    const level = headingToken.depth;
    const heading = parseHelpHeading(text, level);
    const anchor = heading.id;
    return `<h${level} id="${anchor}" class="doc-heading doc-heading-${level}">${heading.text}</h${level}>`;
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
    if (disposed) return;
    const request = ++indexRequest;
    const language = uiLocale.value;
    const current = () => !disposed && request === indexRequest && uiLocale.value === language;
    try {
      const result = await HelpService.getIndex(language);
      if (!current()) return;
      documents.value = result;
      if (!categoriesInitialized) {
        expandedCategories.value = new Set(
          result
            .filter((doc) => doc.categoryId !== 'release-notes')
            .map((doc) => doc.categoryId ?? 'guides'),
        );
        categoriesInitialized = true;
      }
      const id =
        typeof route.params.docId === 'string' && route.params.docId
          ? route.params.docId
          : (currentDoc.value?.id ?? 'front-page');
      const doc = result.find((entry) => entry.id === id);
      if (doc) {
        await loadDocumentContent(doc);
        return;
      }
      if (isTablet.value && result.length && !currentDoc.value)
        await router.replace(`/help/${result[0]!.id}`);
    } catch (failure) {
      if (current()) {
        error.value = localizedErrorMessage(failure, language, 'helpFeedback.requestFailed');
        loading.value = false;
      }
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

  function getContentScrollElement(): HTMLElement | null {
    return isPhone.value
      ? ((document.scrollingElement as HTMLElement | null) ?? document.documentElement)
      : document.querySelector<HTMLElement>('.help-content-scroll');
  }

  function captureReadingSection(): string {
    const container = getContentScrollElement();
    if (!container || !content.value) return activeHeading.value;
    if (container.scrollTop === 0 && route.hash) return route.hash.substring(1);
    const top =
      (isPhone.value
        ? (document.querySelector('.mobile-shell-sysbar')?.getBoundingClientRect().bottom ?? 0)
        : container.getBoundingClientRect().top) + 8;
    const visible = toc.value.filter((heading) => {
      const element = document.getElementById(heading.id);
      return element && element.getBoundingClientRect().top <= top;
    });
    return visible.at(-1)?.id ?? toc.value[0]?.id ?? activeHeading.value;
  }

  let loadedKey = '';
  watch(
    uiLocale,
    () => {
      activeHeading.value = captureReadingSection();
      ++indexRequest;
      ++documentRequest;
      loadedKey = '';
      content.value = '';
      toc.value = [];
      error.value = '';
      loading.value = Boolean(route.params.docId || currentDoc.value);
      void loadDocumentIndex();
    },
    { flush: 'sync' },
  );

  async function loadDocumentContent(doc: HelpDocument) {
    if (disposed) return;
    const language = uiLocale.value;
    const key = `${language}:${doc.id}`;
    if (loadedKey === key && currentDoc.value?.id === doc.id) {
      const request = documentRequest;
      if (route.hash) {
        await nextTick();
        if (
          disposed ||
          request !== documentRequest ||
          uiLocale.value !== language ||
          currentDoc.value?.id !== doc.id
        )
          return;
        scrollToHeading(route.hash.substring(1), false);
      }
      return;
    }
    const request = ++documentRequest;
    const current = () =>
      !disposed &&
      request === documentRequest &&
      uiLocale.value === language &&
      currentDoc.value?.id === doc.id;
    const position =
      currentDoc.value?.id === doc.id
        ? activeHeading.value || route.hash.substring(1)
        : route.hash.substring(1);
    if (currentDoc.value?.id !== doc.id) {
      expandedCategories.value = new Set([...expandedCategories.value, doc.categoryId ?? 'guides']);
    }
    loading.value = true;
    error.value = '';
    currentDoc.value = doc;
    toc.value = [];
    activeHeading.value = '';
    try {
      const resource = await HelpService.getDocument(doc.id, language);
      if (!current()) return;
      const html = await marked.parse(resource.markdown, { renderer });
      if (!current()) return;
      currentDoc.value = resource.doc;
      toc.value = resource.headings.filter((heading) => heading.level >= 1 && heading.level <= 4);
      content.value = DOMPurify.sanitize(html, { ADD_ATTR: ['data-href'] });
      loadedKey = key;
      await nextTick();
      if (!current()) return;
      const headingId = position ? resolveHelpSection(resource.doc, position) : '';
      if (headingId) scrollToHeading(headingId, false);
      else {
        const container = getContentScrollElement();
        if (container) container.scrollTop = 0;
      }
      if (route.hash && headingId !== route.hash.substring(1))
        await router.replace({ ...route, hash: `#${headingId}` });
    } catch (failure) {
      if (current())
        error.value = localizedErrorMessage(failure, language, 'helpFeedback.requestFailed');
    } finally {
      if (current()) loading.value = false;
    }
  }

  async function scrollToHeading(section: string, updateUrl = true) {
    const id = currentDoc.value ? resolveHelpSection(currentDoc.value, section) : section;
    const element = document.getElementById(id);
    if (element) {
      activeHeading.value = id;
      showTocDrawer.value = false;
      if (updateUrl) {
        await router.replace({ ...route, hash: `#${id}` });
      }
      await nextTick();
      if (disposed || !element.isConnected) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  onUnmounted(() => {
    disposed = true;
    ++indexRequest;
    ++documentRequest;
    loading.value = false;
  });
  const categoryLabel = (id: string) =>
    documents.value.find((doc) => doc.categoryId === id)?.category ?? id;

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
    categoryLabel,
    categoryChevron,
    isCategoryExpanded,
    isActiveDoc,
    // actions
    loadDocumentIndex,
    navigateToDocument,
    toggleCategory,
    scrollToHeading,
    handleContentClick,
  };
}
