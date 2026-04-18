<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBooksStore } from 'src/stores/books';
import type { Novel } from 'src/models/novel';

const router = useRouter();
const booksStore = useBooksStore();
const menuContainerRef = ref<HTMLElement | null>(null);

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

const topItems: MenuItem[] = [
  {
    label: '首页',
    icon: 'pi pi-home',
    command: () => void router.push('/'),
  },
  {
    label: '书籍列表',
    icon: 'pi pi-book',
    command: () => void router.push('/books'),
  },
  {
    label: 'AI列表',
    icon: 'pi pi-sparkles',
    command: () => void router.push('/ai'),
  },
];

const bottomItems: MenuItem[] = [
  {
    label: '设置',
    icon: 'pi pi-cog',
    command: () => void router.push('/settings'),
  },
  {
    label: '帮助',
    icon: 'pi pi-question-circle',
    command: () => void router.push('/help'),
  },
];
</script>

<template>
  <aside
    ref="menuContainerRef"
    class="w-full md:w-64 shrink-0 h-full border-r border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative"
  >
    <!-- Subtle gradient overlay -->
    <div
      class="absolute inset-0 bg-gradient-to-b from-tsukuyomi-500/5 via-transparent to-transparent pointer-events-none"
    />

    <!-- Top section with logo/branding area -->
    <div class="shrink-0 px-4 pt-6 pb-4 relative z-10">
    </div>

    <!-- Main navigation -->
    <div class="flex-1 overflow-auto px-3 pt-2 pb-2 min-h-0 min-w-0 max-w-full relative z-10">
      <!-- 导航菜单 -->
      <div class="mb-6">
        <Menu :model="topItems" />
      </div>
      
      <!-- 分隔线 -->
      <div class="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mb-4" />
      
      <!-- 收藏小说独立区域 -->
      <div class="mt-4 min-w-0 max-w-full overflow-hidden">
        <!-- 标题区域 -->
        <div class="px-3 py-2 mb-3 bg-surface-subtle rounded-lg border border-surface-subtle min-w-0 max-w-full overflow-hidden">
          <div class="flex items-center gap-2 min-w-0">
            <i class="pi pi-bookmark text-accent-400 text-sm flex-shrink-0" />
            <span class="font-ui text-[11px] font-medium text-moon/60 uppercase tracking-[0.2em] flex-shrink-0">收藏小说</span>
            <span v-if="starredNovels.length > 0" class="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-accent-400/20 text-accent-400 flex-shrink-0">
              {{ starredNovels.length }}
            </span>
          </div>
        </div>
        
        <!-- 收藏小说列表 -->
        <div v-if="starredNovels.length > 0" class="space-y-1 min-w-0 max-w-full overflow-hidden">
          <button
            v-for="book in starredNovels"
            :key="book.id"
            class="w-full text-left px-3 py-2 rounded-lg text-sm text-moon/80 hover:bg-primary/15 hover:text-moon/95 hover:border-primary/30 border border-transparent transition-all duration-200 flex items-center gap-2 group min-w-0 overflow-hidden"
            style="max-width: 100%; box-sizing: border-box;"
            @click="() => void router.push(`/books/${book.id}`)"
          >
            <i class="pi pi-star-fill text-yellow-400 text-xs flex-shrink-0" />
            <span class="truncate flex-1 min-w-0 text-ellipsis whitespace-nowrap overflow-hidden">{{ book.title }}</span>
          </button>
        </div>
        
        <!-- 空状态 -->
        <div v-else class="px-3 py-2 text-xs text-moon/40 italic text-center">
          暂无收藏的小说
        </div>
      </div>
    </div>

    <!-- Bottom section -->
    <div class="shrink-0 px-3 pb-4 relative z-10">
      <div
        class="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mb-3"
        role="separator"
      />
      <Menu :model="bottomItems" />
    </div>
  </aside>
</template>

<style scoped>
/* Make PrimeVue Menu background transparent within this component */
:deep(.p-menu) {
  background-color: transparent;
  border: none;
  padding: 0;
}

/* Submenu header styling */
:deep(.p-menu .p-submenu-header) {
  background-color: var(--white-opacity-5);
  color: var(--moon-opacity-80);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.75rem 0.75rem 0.5rem;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--white-opacity-10);
}

:deep(.p-menu .p-submenu-header:first-child) {
  margin-top: 0;
}

/* Menu item styling */
:deep(.p-menu .p-menuitem-link) {
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.25rem;
  transition: all 0.2s ease;
  color: var(--moon-opacity-85);
  background-color: transparent;
  border: 1px solid transparent;
}

/* Hover state */
:deep(.p-menu .p-menuitem-link:hover) {
  background-color: var(--primary-opacity-15);
  color: var(--moon-opacity-95);
  border-color: var(--primary-opacity-30);
  transform: translateX(2px);
}

/* Active state — 设计系统：active 态使用薄藍高亮衬底 (bg-highlight-tint) + 薄藍边框 */
:deep(.p-menu .p-menuitem-link.router-link-active),
:deep(.p-menu .p-menuitem-link[aria-expanded='true']) {
  background-color: rgba(109, 136, 168, 0.12);
  color: var(--moon-opacity-100);
  border-color: rgba(109, 136, 168, 0.35);
  box-shadow: 0 2px 8px rgba(109, 136, 168, 0.18);
  font-weight: 500;
}

:deep(.p-menu .p-menuitem-link.router-link-active .p-menuitem-icon),
:deep(.p-menu .p-menuitem-link[aria-expanded='true'] .p-menuitem-icon) {
  color: #BAC9DB; /* tsukuyomi-200 */
}

/* Icon styling */
:deep(.p-menu .p-menuitem-icon) {
  color: var(--primary-opacity-70);
  margin-right: 0.75rem;
  transition: all 0.2s ease;
  font-size: 1rem;
}

:deep(.p-menu .p-menuitem-link:hover .p-menuitem-icon) {
  color: var(--primary-opacity-90);
  transform: scale(1.1);
}

/* Label styling */
:deep(.p-menu .p-menuitem-text) {
  font-family:
    'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', -apple-system, sans-serif;
  font-size: 0.875rem;
  font-weight: 400;
}

/* Focus state */
:deep(.p-menu .p-menuitem-link:focus) {
  outline: none;
  box-shadow: 0 0 0 2px var(--primary-opacity-30);
}

/* Smooth transitions for all interactive elements */
:deep(.p-menu .p-menuitem) {
  transition: all 0.2s ease;
}
</style>
