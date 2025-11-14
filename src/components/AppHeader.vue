<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '../stores/ui';

const router = useRouter();
const ui = useUiStore();

const menuItems = ref<MenuItem[]>([
  // {
  //   label: '首页',
  //   icon: 'pi pi-home',
  //   command: () => {
  //     void router.push('/');
  //   },
  // },
]);
</script>

<template>
  <header class="sticky top-0 z-20 shadow-sm shrink-0">
    <Menubar :model="menuItems" class="!rounded-none">
      <template #start>
        <div class="flex items-center gap-2 px-2 mr-3">
          <Button
            aria-label="切换侧边栏"
            class="p-button-text p-button-rounded"
            icon="pi pi-bars"
            @click="ui.toggleSideMenu()"
          />
          <i class="pi pi-sparkles text-primary-600" />
          <span class="font-semibold">Luna AI Translator</span>
        </div>
      </template>

      <template #end>
        <div class="flex items-center gap-2 px-2 mr-3">
          <i class="pi pi-bell" />
        </div>
      </template>
    </Menubar>
  </header>
</template>
