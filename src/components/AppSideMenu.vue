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
    class="w-64 shrink-0 h-full overflow-hidden border-r border-white/10 bg-night-950/85 dark:bg-night-950/90 flex flex-col"
  >
    <div class="flex-1 overflow-auto px-2 pt-4 pb-2 min-h-0">
      <Menu :model="topItems" class="mb-2" />
    </div>
    <div class="shrink-0 px-2 pb-3">
      <div class="h-px w-full bg-white/20 mb-2" role="separator" />
      <Menu :model="bottomItems" />
    </div>
  </aside>
</template>

<style scoped>
/* Make PrimeVue Menu background transparent within this component */
:deep(.p-menu) {
  background-color: transparent;
}
/* Ensure submenu header (e.g., "导航") has transparent background */
:deep(.p-menu .p-submenu-header) {
  background-color: transparent;
}
</style>
