<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem';
import { ref, type ComponentPublicInstance } from 'vue';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import { useUiStore } from '../stores/ui';
import { useToastHistory } from 'src/composables/useToastHistory';
import ToastHistoryDialog from './ToastHistoryDialog.vue';

const ui = useUiStore();
const { unreadCount } = useToastHistory();

const menuItems = ref<MenuItem[]>([
  // {
  //   label: '首页',
  //   icon: 'pi pi-home',
  //   command: () => {
  //     void router.push('/');
  //   },
  // },
]);

const bellButtonRef = ref<HTMLElement | null>(null);
const toastHistoryRef = ref<ComponentPublicInstance<{ toggle: (event: Event) => void }> | null>(null);

const toggleHistoryDialog = (event: Event) => {
  toastHistoryRef.value?.toggle(event);
};
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
          <i class="pi pi-moon text-primary-600" />
          <span class="font-semibold">Luna AI Translator</span>
        </div>
      </template>

      <template #end>
        <div class="flex items-center gap-2 px-2 mr-3">
          <Button
            ref="bellButtonRef"
            aria-label="消息历史"
            class="p-button-text p-button-rounded relative bell-button"
            @click="toggleHistoryDialog"
          >
            <i class="pi pi-bell" />
            <Badge
              v-if="unreadCount > 0"
              :value="unreadCount > 99 ? '99+' : unreadCount"
              class="absolute top-0 right-0"
              severity="danger"
            />
          </Button>
        </div>
      </template>
    </Menubar>

    <!-- Toast 历史 Popover -->
    <ToastHistoryDialog ref="toastHistoryRef" />
  </header>
</template>

<style scoped>
.bell-button i {
  color: var(--moon-opacity-85) !important;
  font-size: 1rem;
}

.bell-button:hover i {
  color: var(--moon-opacity-95) !important;
}
</style>
