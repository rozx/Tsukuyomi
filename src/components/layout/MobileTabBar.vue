<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUiStore } from 'src/stores/ui';
import SettingsDialog from 'src/components/dialogs/SettingsDialog.vue';

const router = useRouter();
const route = useRoute();
const ui = useUiStore();
const settingsDialogVisible = ref(false);

type TabId = 'home' | 'library' | 'chat' | 'ai' | 'settings';

type Tab = { id: TabId; icon: string; label: string };

const tabs: Tab[] = [
  { id: 'home', icon: 'pi-home', label: '首页' },
  { id: 'library', icon: 'pi-book', label: '书库' },
  { id: 'chat', icon: 'pi-sparkles', label: 'AI 助手' },
  { id: 'ai', icon: 'pi-objects-column', label: 'AI 模型' },
  { id: 'settings', icon: 'pi-cog', label: '设置' },
];

const activeTab = computed<TabId>(() => {
  if (ui.rightPanelOpen && ui.activeRightTab === 'chat') return 'chat';
  const path = route.path;
  if (path === '/') return 'home';
  if (path.startsWith('/ai')) return 'ai';
  if (path.startsWith('/books')) return 'library';
  return 'home';
});

const onTabClick = (id: TabId) => {
  switch (id) {
    case 'home':
      if (ui.rightPanelOpen) ui.closeRightPanel();
      if (route.path !== '/') void router.push('/');
      return;
    case 'library':
      if (ui.rightPanelOpen) ui.closeRightPanel();
      if (route.path !== '/books') void router.push('/books');
      return;
    case 'chat':
      ui.setActiveRightTab('chat');
      if (ui.rightPanelOpen) {
        ui.closeRightPanel();
      } else {
        ui.openRightPanel();
      }
      return;
    case 'ai':
      if (ui.rightPanelOpen) ui.closeRightPanel();
      if (route.path !== '/ai') void router.push('/ai');
      return;
    case 'settings':
      settingsDialogVisible.value = true;
      return;
  }
};
</script>

<template>
  <nav class="mobile-tabbar" aria-label="主导航">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: activeTab === tab.id, 'fab-like': tab.id === 'chat' }"
      @click="onTabClick(tab.id)"
    >
      <i :class="['pi', tab.icon]" />
      <span>{{ tab.label }}</span>
    </button>
  </nav>

  <SettingsDialog v-model:visible="settingsDialogVisible" />
</template>

<style scoped>
.mobile-tabbar {
  display: flex;
  align-items: stretch;
  padding: 8px 6px calc(env(safe-area-inset-bottom, 0px) + 12px);
  background: rgba(10, 12, 15, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  z-index: 40;
  flex-shrink: 0;
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 10px;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 500;
  color: rgba(247, 244, 236, 0.55);
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tab i {
  font-size: 20px;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tab:active {
  background: rgba(255, 255, 255, 0.04);
}

.tab.active {
  color: #e9edf5;
}

.tab.active i {
  color: #a3b7cf;
  text-shadow: 0 0 12px rgba(109, 136, 168, 0.5);
}

/* Center tab gets a subtle glowing chip — matches the design's fab-like treatment */
.tab.fab-like {
  position: relative;
}

.tab.fab-like::before {
  content: '';
  position: absolute;
  inset: 4px 10px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(109, 136, 168, 0.22), rgba(109, 136, 168, 0.06));
  border: 1px solid rgba(109, 136, 168, 0.32);
  z-index: -1;
}

.tab.fab-like.active::before {
  background: linear-gradient(180deg, rgba(109, 136, 168, 0.35), rgba(109, 136, 168, 0.12));
  border-color: rgba(163, 183, 207, 0.5);
  box-shadow: 0 2px 12px rgba(109, 136, 168, 0.3);
}
</style>
