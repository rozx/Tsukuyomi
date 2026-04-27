<script setup lang="ts">
import { useMainNavActive, type MainNavTab } from 'src/composables/useMainNavActive';
import { useMainNavDispatch } from 'src/composables/layout/useMainNavDispatch';

type Tab = { id: MainNavTab; icon: string; label: string };

// 内容 → AI 工具 → 应用设置：
//   首页 · 书库   ← 内容入口
//   AI 助手 · AI 模型  ← 核心 AI 功能（把 AI 集群放在中间方便拇指触达）
//   设置         ← 配置入口（帮助已移至顶栏）
const tabs: Tab[] = [
  { id: 'home', icon: 'pi-home', label: '首页' },
  { id: 'library', icon: 'pi-book', label: '书库' },
  { id: 'chat', icon: 'pi-sparkles', label: '月詠' },
  { id: 'ai', icon: 'pi-microchip-ai', label: 'AI 模型' },
  { id: 'settings', icon: 'pi-cog', label: '设置' },
];

const activeTab = useMainNavActive();
const { dispatch: onTabClick } = useMainNavDispatch();
</script>

<template>
  <nav class="mobile-tabbar" aria-label="主导航">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: activeTab === tab.id }"
      @click="onTabClick(tab.id)"
    >
      <i :class="['pi', tab.icon]" />
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.mobile-tabbar {
  display: flex;
  align-items: stretch;
  padding: 8px 6px calc(env(safe-area-inset-bottom, 0px) + 18px);
  background: rgba(10, 12, 15, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(138, 147, 160, 0.95);
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tab i {
  font-size: 20px;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    text-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
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
</style>
