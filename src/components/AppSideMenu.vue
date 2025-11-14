<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { useRouter } from 'vue-router';

const router = useRouter();

const topItems: MenuItem[] = [
  {
    label: '导航',
    items: [
      {
        label: '首页',
        icon: 'pi pi-home',
        command: () => void router.push('/'),
      },
    ],
  },
  {
    label: '书籍管理',
    items: [
      {
        label: '书籍列表',
        icon: 'pi pi-book',
        command: () => void router.push('/books'),
      },
    ],
  },
  {
    label: 'AI管理',
    items: [
      {
        label: 'AI列表',
        icon: 'pi pi-sparkles',
        command: () => void router.push('/ai'),
      },
    ],
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
    class="w-64 shrink-0 h-full overflow-hidden border-r border-white/10 bg-night-950/95 backdrop-blur-sm flex flex-col relative"
  >
    <!-- Subtle gradient overlay -->
    <div
      class="absolute inset-0 bg-gradient-to-b from-luna-500/5 via-transparent to-transparent pointer-events-none"
    />

    <!-- Top section with logo/branding area -->
    <div class="shrink-0 px-4 pt-6 pb-4 relative z-10">
      <div class="flex items-center gap-2 mb-6">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-luna-500 to-luna-600 flex items-center justify-center shadow-lg shadow-luna-500/30">
          <i class="pi pi-sparkles text-white text-sm" />
        </div>
        <span class="font-semibold text-moon-500 text-sm tracking-wide">Luna AI</span>
      </div>
    </div>

    <!-- Main navigation -->
    <div class="flex-1 overflow-auto px-3 pt-2 pb-2 min-h-0 relative z-10">
      <Menu :model="topItems" class="mb-4" />
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
  background-color: transparent;
  color: rgba(246, 243, 209, 0.6);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.75rem 0.75rem 0.5rem;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
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
  color: rgba(246, 243, 209, 0.85);
  background-color: transparent;
  border: 1px solid transparent;
}

/* Hover state */
:deep(.p-menu .p-menuitem-link:hover) {
  background-color: rgba(85, 103, 242, 0.15);
  color: rgba(246, 243, 209, 0.95);
  border-color: rgba(85, 103, 242, 0.3);
  transform: translateX(2px);
}

/* Active state */
:deep(.p-menu .p-menuitem-link.router-link-active),
:deep(.p-menu .p-menuitem-link[aria-expanded='true']) {
  background: linear-gradient(135deg, rgba(85, 103, 242, 0.25) 0%, rgba(85, 103, 242, 0.15) 100%);
  color: rgba(246, 243, 209, 1);
  border-color: rgba(85, 103, 242, 0.4);
  box-shadow: 0 2px 8px rgba(85, 103, 242, 0.15);
  font-weight: 500;
}

/* Icon styling */
:deep(.p-menu .p-menuitem-icon) {
  color: rgba(85, 103, 242, 0.7);
  margin-right: 0.75rem;
  transition: all 0.2s ease;
  font-size: 1rem;
}

:deep(.p-menu .p-menuitem-link:hover .p-menuitem-icon) {
  color: rgba(85, 103, 242, 0.9);
  transform: scale(1.1);
}

:deep(.p-menu .p-menuitem-link.router-link-active .p-menuitem-icon),
:deep(.p-menu .p-menuitem-link[aria-expanded='true'] .p-menuitem-icon) {
  color: rgba(85, 103, 242, 1);
}

/* Label styling */
:deep(.p-menu .p-menuitem-text) {
  font-size: 0.875rem;
  font-weight: 400;
}

/* Focus state */
:deep(.p-menu .p-menuitem-link:focus) {
  outline: none;
  box-shadow: 0 0 0 2px rgba(85, 103, 242, 0.3);
}

/* Smooth transitions for all interactive elements */
:deep(.p-menu .p-menuitem) {
  transition: all 0.2s ease;
}
</style>
