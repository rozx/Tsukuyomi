<script setup lang="ts">
/**
 * 书籍详情侧栏 · 设置快捷入口菜单（展开 / 折叠两态，带高度过渡）。
 * 从 BookDetailsDesktop 抽出以降低侧栏模板复杂度。样式（settings-menu* + sidebar-eyebrow 基础）
 * 为本组件 scoped。
 */
import { ref } from 'vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import { useUiStore } from 'src/stores/ui';
import type { SettingMenu } from 'src/composables/book-details/useBookDetailsPage';

const ctx = injectBookDetailsPage();
const ui = useUiStore();

const settingsShellRef = ref<HTMLElement | null>(null);

function onSettingsBeforeLeave() {
  const shell = settingsShellRef.value;
  if (!shell) return;
  shell.style.height = `${shell.offsetHeight}px`;
}
function onSettingsEnter(el: Element) {
  const shell = settingsShellRef.value;
  if (!shell) return;
  const target = (el as HTMLElement).scrollHeight;
  requestAnimationFrame(() => {
    if (!settingsShellRef.value) return;
    settingsShellRef.value.style.height = `${target}px`;
  });
}
function onSettingsAfterEnter() {
  const shell = settingsShellRef.value;
  if (!shell) return;
  shell.style.height = '';
}

const isSelected = (menu: SettingMenu) => ctx.selectedSettingMenu.value === menu;
</script>

<template>
  <section class="sidebar-section settings-menu-wrapper">
    <div ref="settingsShellRef" class="settings-menu-shell">
      <Transition
        name="settings-menu"
        @before-leave="onSettingsBeforeLeave"
        @enter="onSettingsEnter"
        @after-enter="onSettingsAfterEnter"
      >
        <div v-if="ui.bookSettingsMenuExpanded" key="expanded" class="settings-menu-expanded">
          <div class="settings-menu-header">
            <span class="sidebar-eyebrow settings-menu-eyebrow">SETTINGS</span>
            <button
              type="button"
              class="settings-menu-toggle"
              title="收起设置菜单"
              aria-label="收起设置菜单"
              @click="ui.toggleBookSettingsMenu"
            >
              <i class="pi pi-chevron-up" />
            </button>
          </div>
          <div class="settings-menu-items">
            <button
              class="settings-menu-item"
              :class="{ 'settings-menu-item-selected': isSelected('terms') }"
              @click="ctx.navigateToTermsSetting"
            >
              <i class="pi pi-bookmark settings-menu-icon" />
              <span class="settings-menu-label">术语设置</span>
            </button>
            <button
              class="settings-menu-item"
              :class="{ 'settings-menu-item-selected': isSelected('characters') }"
              @click="ctx.navigateToCharactersSetting"
            >
              <i class="pi pi-users settings-menu-icon" />
              <span class="settings-menu-label">角色设置</span>
            </button>
            <button
              class="settings-menu-item"
              :class="{ 'settings-menu-item-selected': isSelected('memory') }"
              @click="ctx.navigateToMemorySetting"
            >
              <i class="pi pi-database settings-menu-icon" />
              <span class="settings-menu-label">记忆管理</span>
            </button>
            <button class="settings-menu-item" @click="ctx.openScraperDialog">
              <i class="pi pi-download settings-menu-icon" />
              <span class="settings-menu-label">检查更新</span>
            </button>
          </div>
        </div>
        <div v-else key="collapsed" class="settings-menu-items settings-menu-items--collapsed">
          <button
            type="button"
            class="settings-menu-item"
            :class="{ 'settings-menu-item-selected': isSelected('terms') }"
            title="术语设置"
            aria-label="术语设置"
            @click="ctx.navigateToTermsSetting"
          >
            <i class="pi pi-bookmark settings-menu-icon" />
          </button>
          <button
            type="button"
            class="settings-menu-item"
            :class="{ 'settings-menu-item-selected': isSelected('characters') }"
            title="角色设置"
            aria-label="角色设置"
            @click="ctx.navigateToCharactersSetting"
          >
            <i class="pi pi-users settings-menu-icon" />
          </button>
          <button
            type="button"
            class="settings-menu-item"
            :class="{ 'settings-menu-item-selected': isSelected('memory') }"
            title="记忆管理"
            aria-label="记忆管理"
            @click="ctx.navigateToMemorySetting"
          >
            <i class="pi pi-database settings-menu-icon" />
          </button>
          <button
            type="button"
            class="settings-menu-item"
            title="检查更新"
            aria-label="检查更新"
            @click="ctx.openScraperDialog"
          >
            <i class="pi pi-download settings-menu-icon" />
          </button>
          <button
            type="button"
            class="settings-menu-item settings-menu-expand"
            title="展开设置菜单"
            aria-label="展开设置菜单"
            @click="ui.toggleBookSettingsMenu"
          >
            <i class="pi pi-chevron-down settings-menu-icon" />
          </button>
        </div>
      </Transition>
    </div>
    <div class="settings-menu-separator" />
  </section>
</template>

<style scoped>
/* sidebar-eyebrow 基础样式本属于侧栏，但 scoped 不跨组件；此处复用同一份以免 menu 头部丢样式 */
.sidebar-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  /* token: accent-silver @ 42% */
  color: var(--accent-opacity-42);
  padding: 0.7rem 0.9rem 0.2rem;
}

.settings-menu-wrapper {
  flex-shrink: 0;
  padding: 0 0.5rem 0.25rem;
}

.settings-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}

.settings-menu-eyebrow {
  flex: 1;
}

.settings-menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  margin-right: 0.25rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--moon-50-opacity-55);
  font-size: 0.7rem;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.settings-menu-toggle:hover {
  background: var(--white-opacity-5);
  color: var(--moon-50-opacity-90);
}

.settings-menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.settings-menu-items--collapsed {
  position: relative;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.1rem 0.1rem;
}

.settings-menu-items--collapsed .settings-menu-item {
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  padding: 0;
  justify-content: center;
}

.settings-menu-items--collapsed .settings-menu-icon {
  width: auto;
}

.settings-menu-items--collapsed .settings-menu-expand {
  position: absolute;
  right: 0.1rem;
  top: 50%;
  transform: translateY(-50%);
}

.settings-menu-shell {
  position: relative;
  overflow: hidden;
  transition: height 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: height;
}

.settings-menu-enter-active,
.settings-menu-leave-active {
  transition: opacity 0.18s ease;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
}

.settings-menu-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.settings-menu-separator {
  height: 1px;
  background: var(--white-opacity-6);
  margin: 0.5rem 0.5rem 0;
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  /* token: moon-50 @ 72% */
  color: var(--moon-50-opacity-72);
  font-size: 0.82rem;
  font-family: inherit;
  text-align: left;
  width: 100%;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.settings-menu-item:hover {
  background: var(--white-opacity-5);
  color: var(--moon-50-opacity-100);
}

.settings-menu-item-selected {
  background: var(--tsukuyomi-opacity-20);
  color: var(--moon-50-opacity-100);
}

.settings-menu-item-selected .settings-menu-icon {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.settings-menu-icon {
  font-size: 0.85rem;
  width: 1rem;
  color: var(--moon-50-opacity-55);
  transition: color 0.15s ease;
}

.settings-menu-item:hover .settings-menu-icon {
  color: var(--moon-50-opacity-90);
}

.settings-menu-label {
  flex: 1;
}
</style>
