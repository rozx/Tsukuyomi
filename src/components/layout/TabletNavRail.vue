<script setup lang="ts">
import { useMainNavActive, type MainNavTab } from 'src/composables/useMainNavActive';
import { useMainNavDispatch } from 'src/composables/layout/useMainNavDispatch';
import { getAssetUrl } from 'src/utils';
import { APP_NAME } from 'src/constants/app';

type Item = { id: MainNavTab; icon: string; label: string };

// 主导航三项（首页 · 书库 · AI 模型）在顶部，帮助 / 设置固定在底部。
const primaryItems: Item[] = [
  { id: 'home', icon: 'pi-home', label: '首页' },
  { id: 'library', icon: 'pi-book', label: '书库' },
  { id: 'ai', icon: 'pi-microchip-ai', label: 'AI 模型' },
];

// 底部工具项：帮助 · 设置
const secondaryItems: Item[] = [
  { id: 'help', icon: 'pi-question-circle', label: '帮助' },
  { id: 'settings', icon: 'pi-cog', label: '设置' },
];

const activeTab = useMainNavActive();

const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

const { dispatch: onItemClick } = useMainNavDispatch();
</script>

<template>
  <nav class="tablet-navrail" aria-label="主导航">
    <button
      class="rail-logo"
      :aria-label="APP_NAME.full"
      @click="onItemClick('home')"
    >
      <img :src="logoPath" :alt="APP_NAME.full" />
    </button>

    <div class="rail-items">
      <button
        v-for="item in primaryItems"
        :key="item.id"
        class="rail-item"
        :class="{ active: activeTab === item.id }"
        :aria-label="item.label"
        :title="item.label"
        @click="onItemClick(item.id)"
      >
        <i :class="['pi', item.icon]" aria-hidden="true" />
      </button>
    </div>

    <div class="rail-spacer" />

    <div class="rail-items">
      <button
        v-for="item in secondaryItems"
        :key="item.id"
        class="rail-item"
        :class="{ active: activeTab === item.id }"
        :aria-label="item.label"
        :title="item.label"
        @click="onItemClick(item.id)"
      >
        <i :class="['pi', item.icon]" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.tablet-navrail {
  width: 64px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 0 16px;
  gap: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.rail-logo {
  width: 40px;
  height: 40px;
  border: none;
  padding: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  margin-bottom: 14px;
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rail-logo img {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  object-fit: cover;
  display: block;
}

.rail-logo:hover {
  transform: scale(1.05);
}

.rail-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.rail-item {
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

.rail-item i {
  font-size: 16px;
  line-height: 1;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    text-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.rail-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 1);
}

.rail-item.active {
  background: rgba(109, 136, 168, 0.18);
  border-color: rgba(109, 136, 168, 0.3);
  color: #a3b7cf;
}

.rail-item.active i {
  text-shadow: 0 0 12px rgba(109, 136, 168, 0.55);
}

.rail-spacer {
  flex: 1;
}
</style>
