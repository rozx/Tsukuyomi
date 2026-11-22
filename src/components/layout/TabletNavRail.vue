<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

import { useMainNavActive, type MainNavTab } from 'src/composables/useMainNavActive';
import { useMainNavDispatch } from 'src/composables/layout/useMainNavDispatch';
import { getAssetUrl } from 'src/utils';
import { APP_NAME } from 'src/constants/app';
import { isNavTabEnabled } from 'src/constants/features';
import { useIssueReportUrl } from 'src/composables/useIssueReportUrl';

type Item = { id: MainNavTab; icon: string; label: string };

// 主导航（首页 · 书库 · AI 导入 · AI 模型）在顶部，反馈问题 / 帮助 / 设置固定在底部。
const primaryItems = computed(() =>
  (
    [
      { id: 'home', icon: 'pi-home', label: i18nT('libraryUi.home') },
      { id: 'library', icon: 'pi-book', label: i18nT('libraryUi.library') },
      { id: 'import', icon: 'pi-file-import', label: i18nT('libraryUi.aiImport') },
      { id: 'ai', icon: 'pi-microchip-ai', label: i18nT('libraryUi.aiModels') },
      { id: 'mcp', icon: 'pi-link', label: i18nT('libraryUi.agentMcp') },
    ] satisfies Item[]
  ).filter((item) => isNavTabEnabled(item.id)),
);

// 底部工具项：帮助 · 设置
const secondaryItems = computed<Item[]>(() => [
  { id: 'help', icon: 'pi-question-circle', label: i18nT('libraryUi.help') },
  { id: 'settings', icon: 'pi-cog', label: i18nT('libraryUi.settings') },
]);

const activeTab = useMainNavActive();

const logoPath = getAssetUrl('icons/android-chrome-512x512.png');

const { dispatch: onItemClick } = useMainNavDispatch();

// 反馈问题：外链到 GitHub 新建 Issue，不属于路由导航，没有激活态
const issueReportUrl = useIssueReportUrl();
</script>

<template>
  <nav class="tablet-navrail" :aria-label="i18nT('libraryUi.mainNav')">
    <button class="rail-logo" :aria-label="APP_NAME.full" @click="onItemClick('home')">
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
      <a
        class="rail-item"
        :href="issueReportUrl"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="i18nT('libraryUi.reportIssue')"
        :title="i18nT('libraryUi.reportIssue')"
      >
        <i class="pi pi-megaphone" aria-hidden="true" />
      </a>
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
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
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
</style>

<!-- 图标项 / 激活态等与另一套图标导航逐字相同的规则见 nav-rail.css -->
<style scoped src="./nav-rail.css"></style>
