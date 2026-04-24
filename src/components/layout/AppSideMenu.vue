<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import type { Novel } from 'src/models/novel';
import { useMainNavActive, type MainNavTab } from 'src/composables/useMainNavActive';

interface Props {
  collapsed?: boolean;
}

withDefaults(defineProps<Props>(), { collapsed: false });

const router = useRouter();
const booksStore = useBooksStore();
const menuContainerRef = ref<HTMLElement | null>(null);
const activeTab = useMainNavActive();

type NavEntry = {
  label: string;
  icon: string; // 完整类名，如 'pi pi-home'
  path: string;
  tab: MainNavTab;
};

// 获取收藏的小说
const starredNovels = computed(() => {
  return booksStore.books.filter((book) => book.starred);
});

// 修复 PrimeVue Menu 组件的 aria-hidden 可访问性问题
// PrimeVue 会在子菜单关闭时设置 aria-hidden，但这些元素仍可能获得焦点
// 我们需要移除所有可以获得焦点的菜单项链接上的 aria-hidden 属性
let observer: MutationObserver | null = null;
let handleFocus: ((e: FocusEvent) => void) | null = null;

onMounted(() => {
  const container = menuContainerRef.value;
  if (!container) return;

  // 移除所有菜单项链接上的 aria-hidden 属性
  // 如果元素可以获得焦点，就不应该有 aria-hidden
  const removeAriaHiddenFromFocusable = () => {
    const menuLinks = container.querySelectorAll<HTMLElement>('.p-menuitem-link');
    menuLinks.forEach((link) => {
      // 移除所有菜单项链接上的 aria-hidden，因为它们都是可交互的
      if (link.hasAttribute('aria-hidden')) {
        link.removeAttribute('aria-hidden');
      }
    });
  };

  // 初始清理
  removeAriaHiddenFromFocusable();

  // 监听焦点事件，确保获得焦点的元素没有 aria-hidden
  handleFocus = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('p-menuitem-link')) {
      target.removeAttribute('aria-hidden');
    }
  };

  container.addEventListener('focusin', handleFocus);

  // 使用 MutationObserver 监控 aria-hidden 属性的变化
  // 当 PrimeVue 设置 aria-hidden 时，立即移除它
  observer = new MutationObserver(() => {
    removeAriaHiddenFromFocusable();
  });

  observer.observe(container, {
    attributes: true,
    attributeFilter: ['aria-hidden'],
    subtree: true,
  });
});

onUnmounted(() => {
  const container = menuContainerRef.value;
  if (container && handleFocus) {
    container.removeEventListener('focusin', handleFocus);
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});

const topNav: NavEntry[] = [
  { label: '首页', icon: 'pi pi-home', path: '/', tab: 'home' },
  { label: '书籍列表', icon: 'pi pi-book', path: '/books', tab: 'library' },
  { label: 'AI列表', icon: 'pi pi-sparkles', path: '/ai', tab: 'ai' },
];

const bottomNav: NavEntry[] = [
  { label: '设置', icon: 'pi pi-cog', path: '/settings', tab: 'settings' },
  { label: '帮助', icon: 'pi pi-question-circle', path: '/help', tab: 'help' },
];

const navigate = (path: string) => {
  void router.push(path);
};

const toMenuItems = (entries: NavEntry[]): MenuItem[] =>
  entries.map((entry) => ({
    label: entry.label,
    icon: entry.icon,
    command: () => navigate(entry.path),
  }));

const topItems = computed<MenuItem[]>(() => toMenuItems(topNav));
const bottomItems = computed<MenuItem[]>(() => toMenuItems(bottomNav));
</script>

<template>
  <aside
    v-if="collapsed"
    ref="menuContainerRef"
    class="side-rail"
    aria-label="主导航"
  >
    <div class="side-rail-items">
      <button
        v-for="item in topNav"
        :key="item.tab"
        type="button"
        class="side-rail-item"
        :class="{ active: activeTab === item.tab }"
        :aria-label="item.label"
        :title="item.label"
        @click="navigate(item.path)"
      >
        <i :class="item.icon" aria-hidden="true" />
      </button>
    </div>

    <div class="side-rail-spacer" />

    <div class="side-rail-items">
      <button
        v-for="item in bottomNav"
        :key="item.tab"
        type="button"
        class="side-rail-item"
        :class="{ active: activeTab === item.tab }"
        :aria-label="item.label"
        :title="item.label"
        @click="navigate(item.path)"
      >
        <i :class="item.icon" aria-hidden="true" />
      </button>
    </div>
  </aside>

  <aside v-else ref="menuContainerRef" class="side-nav">
    <div class="side-nav-gradient" />

    <div class="side-nav-brand" />

    <div class="side-nav-body">
      <div class="side-nav-section">
        <div class="side-nav-section-label">导航</div>
        <Menu :model="topItems" />
      </div>

      <div class="side-nav-divider" />

      <div class="side-nav-favorites">
        <div class="side-nav-favorites-head">
          <i class="pi pi-bookmark" />
          <span>收藏小说</span>
          <span v-if="starredNovels.length > 0" class="side-nav-favorites-count">
            {{ starredNovels.length }}
          </span>
        </div>

        <div v-if="starredNovels.length > 0" class="side-nav-favorites-list">
          <button
            v-for="book in starredNovels"
            :key="book.id"
            class="side-nav-favorites-item"
            @click="() => void router.push(`/books/${book.id}`)"
          >
            <i class="pi pi-star-fill" />
            <span>{{ book.title }}</span>
          </button>
        </div>

        <div v-else class="side-nav-favorites-empty">暂无收藏的小说</div>
      </div>
    </div>

    <div class="side-nav-foot">
      <div class="side-nav-divider" />
      <Menu :model="bottomItems" />
    </div>
  </aside>
</template>

<style scoped>
.side-nav {
  width: 100%;
  max-width: 14rem;
  height: 100%;
  flex-shrink: 0;
  border-right: 1px solid var(--white-opacity-4);
  background: var(--black-opacity-20);
  display: flex;
  flex-direction: column;
  position: relative;
}

.side-nav-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(186, 201, 219, 0.03), transparent 30%);
  pointer-events: none;
}

.side-nav-brand {
  flex-shrink: 0;
  padding: 1.25rem 0.75rem 0.5rem;
  position: relative;
  z-index: 1;
}

.side-nav-body {
  flex: 1;
  overflow: auto;
  padding: 0.5rem 0.5rem 0.75rem;
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  position: relative;
  z-index: 1;
}

.side-nav-section {
  margin-bottom: 1rem;
}

.side-nav-section-label {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent-silver);
  opacity: 0.55;
  padding: 0 0.6rem;
  margin-bottom: 0.4rem;
}

.side-nav-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--white-opacity-8), transparent);
  margin-bottom: 0.75rem;
}

.side-nav-favorites {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.side-nav-favorites-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.6rem;
  margin-bottom: 0.4rem;
  border-radius: 8px;
  border: 1px solid var(--white-opacity-4);
  background: var(--white-opacity-3);
  min-width: 0;
}

.side-nav-favorites-head i {
  color: rgba(234, 192, 123, 0.8);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.side-nav-favorites-head span:nth-child(2) {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-silver);
  opacity: 0.55;
  flex-shrink: 0;
}

.side-nav-favorites-count {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: rgba(234, 192, 123, 0.12);
  color: rgba(234, 192, 123, 0.85);
  flex-shrink: 0;
}

.side-nav-favorites-list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  max-width: 100%;
}

.side-nav-favorites-item {
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--moon-opacity-70);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  max-width: 100%;
  cursor: pointer;
  transition:
    background 160ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 160ms cubic-bezier(0.4, 0, 0.2, 1),
    color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.side-nav-favorites-item:hover {
  background: var(--white-opacity-4);
  color: var(--moon-opacity-95);
}

.side-nav-favorites-item i {
  color: rgba(255, 230, 138, 0.75);
  font-size: 0.65rem;
  flex-shrink: 0;
}

.side-nav-favorites-item span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-nav-favorites-empty {
  padding: 0.4rem 0.6rem;
  font-size: 0.72rem;
  color: var(--moon-opacity-30);
  text-align: center;
  font-style: italic;
}

.side-nav-foot {
  flex-shrink: 0;
  padding: 0 0.5rem 0.5rem;
  position: relative;
  z-index: 1;
}

.side-nav-foot .side-nav-divider {
  margin-bottom: 0.5rem;
}

:deep(.p-menu) {
  background-color: transparent;
  border: none;
  padding: 0;
}

:deep(.p-menu .p-submenu-header) {
  background-color: var(--white-opacity-3);
  color: var(--moon-opacity-75);
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 0.55rem 0.6rem 0.35rem;
  margin-top: 0.5rem;
  margin-bottom: 0.3rem;
  border-radius: 8px;
  border: 1px solid var(--white-opacity-4);
}

:deep(.p-menu .p-submenu-header:first-child) {
  margin-top: 0;
}

:deep(.p-menu .p-menuitem-link) {
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  margin-bottom: 0.15rem;
  transition:
    background 160ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 160ms cubic-bezier(0.4, 0, 0.2, 1),
    color 160ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--moon-opacity-70);
  background-color: transparent;
  border: 1px solid transparent;
}

:deep(.p-menu .p-menuitem-link:hover) {
  background: var(--white-opacity-4);
  color: var(--moon-opacity-95);
  border-color: var(--white-opacity-6);
  transform: translateX(2px);
}

:deep(.p-menu .p-menuitem-link.router-link-active),
:deep(.p-menu .p-menuitem-link[aria-expanded='true']) {
  background: rgba(109, 136, 168, 0.18);
  color: var(--moon-opacity-100);
  border-color: rgba(109, 136, 168, 0.3);
  box-shadow: 0 2px 8px rgba(109, 136, 168, 0.12);
  font-weight: 500;
}

:deep(.p-menu .p-menuitem-link.router-link-active .p-menuitem-icon),
:deep(.p-menu .p-menuitem-link[aria-expanded='true'] .p-menuitem-icon) {
  color: #a3b7cf;
  text-shadow: 0 0 12px rgba(109, 136, 168, 0.5);
}

:deep(.p-menu .p-menuitem-icon) {
  color: var(--accent-silver);
  opacity: 0.75;
  margin-right: 0.6rem;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 0.88rem;
}

:deep(.p-menu .p-menuitem-link:hover .p-menuitem-icon) {
  color: var(--accent-silver);
  opacity: 0.95;
  transform: scale(1.05);
}

:deep(.p-menu .p-menuitem-text) {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    'Hiragino Sans GB',
    -apple-system,
    sans-serif;
  font-size: 0.82rem;
  font-weight: 400;
}

:deep(.p-menu .p-menuitem-link:focus) {
  outline: none;
  box-shadow: 0 0 0 2px rgba(109, 136, 168, 0.2);
}

:deep(.p-menu .p-menuitem) {
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 折叠态：对齐 TabletNavRail 的纯图标竖排 */
.side-rail {
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 0 16px;
  gap: 6px;
  background: var(--black-opacity-20);
  border-right: 1px solid var(--white-opacity-4);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.side-rail-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.side-rail-item {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  color: rgba(174, 183, 198, 0.75);
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
}

.side-rail-item i {
  font-size: 16px;
  line-height: 1;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    text-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.side-rail-item:hover {
  background: var(--white-opacity-4);
  color: rgba(247, 244, 236, 1);
}

.side-rail-item.active {
  background: rgba(109, 136, 168, 0.18);
  border-color: rgba(109, 136, 168, 0.3);
  color: #a3b7cf;
}

.side-rail-item.active i {
  text-shadow: 0 0 12px rgba(109, 136, 168, 0.55);
}

.side-rail-spacer {
  flex: 1;
}
</style>
