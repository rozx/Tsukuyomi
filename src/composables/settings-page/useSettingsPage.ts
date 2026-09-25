import {
  computed,
  inject,
  onMounted,
  provide,
  ref,
  type Component,
  type InjectionKey,
  type Ref,
} from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from 'src/stores/settings';
import { useElectron } from 'src/composables/useElectron';
import AIModelSettingsTab from 'src/components/settings/AIModelSettingsTab.vue';
import ProxySettingsTab from 'src/components/settings/ProxySettingsTab.vue';
import SiteMappingSettingsTab from 'src/components/settings/SiteMappingSettingsTab.vue';
import ApiKeysSettingsTab from 'src/components/settings/ApiKeysSettingsTab.vue';
import SyncSettingsTab from 'src/components/settings/SyncSettingsTab.vue';
import ScraperSettingsTab from 'src/components/settings/ScraperSettingsTab.vue';
import ImportExportTab from 'src/components/settings/ImportExportTab.vue';
import EmbeddingSettingsTab from 'src/components/settings/EmbeddingSettingsTab.vue';
import AboutSection from 'src/components/settings/AboutSection.vue';

/**
 * Shared state + logic for the `/settings` page. Used by the dispatcher
 * (`SettingsPage.vue`) via `provideSettingsPage()` and consumed by each
 * variant (Desktop / Tablet / Mobile) via `injectSettingsPage()`.
 *
 * Replaces the previous `SettingsDialog.vue` popup. Tab-index persistence
 * and intro-toast behavior are preserved; the only behavioral change is
 * that init runs on mount (page navigation) instead of on dialog open.
 */

export interface SettingsTab {
  value: string;
  label: string;
}

export interface SettingsPageContext {
  isElectron: Ref<boolean>;
  activeTab: Ref<string>;
  tabs: Ref<SettingsTab[]>;
  handleTabChange: (value: string | number) => void;
  goBack: () => void;
}

const SETTINGS_PAGE_KEY: InjectionKey<SettingsPageContext> = Symbol('settings-page');

export function provideSettingsPage(): SettingsPageContext {
  const ctx = createSettingsPageContext();
  provide(SETTINGS_PAGE_KEY, ctx);
  return ctx;
}

export function injectSettingsPage(): SettingsPageContext {
  const ctx = inject(SETTINGS_PAGE_KEY);
  if (!ctx) {
    throw new Error(
      'injectSettingsPage() called outside the SettingsPage dispatcher — ensure the variant is mounted by SettingsPage.vue.',
    );
  }
  return ctx;
}

interface SettingsTabDef {
  label: string;
  /** 持久化到 lastOpenedSettingsTab 的稳定序号（沿用旧 SettingsDialog 语义，新增标签取新值） */
  savedIndex: number;
  component: Component;
  /** 仅 Web 显示（Electron 直连，无 CORS 代理） */
  webOnly?: boolean;
}

// 标签顺序与 public/help/settings-guide.md 一致。savedIndex 历史值：
//   0=AI 模型 1=代理设置 2=同步 3=爬虫 4=导入/导出 6=API Keys 7=本地嵌入 8=关于 9=网站映射（新增）
const SETTINGS_TAB_DEFS: readonly SettingsTabDef[] = [
  { label: 'AI 模型', savedIndex: 0, component: AIModelSettingsTab },
  { label: '代理设置', savedIndex: 1, component: ProxySettingsTab, webOnly: true },
  { label: '网站映射', savedIndex: 9, component: SiteMappingSettingsTab },
  { label: 'API Keys', savedIndex: 6, component: ApiKeysSettingsTab },
  { label: '同步设置', savedIndex: 2, component: SyncSettingsTab },
  { label: '本地嵌入', savedIndex: 7, component: EmbeddingSettingsTab },
  { label: '爬虫设置', savedIndex: 3, component: ScraperSettingsTab },
  { label: '导入/导出', savedIndex: 4, component: ImportExportTab },
  { label: '关于', savedIndex: 8, component: AboutSection },
];

/** Electron 上不存在的标签（旧代理设置）回退到 API Keys */
const ELECTRON_FALLBACK_SAVED_INDEX = 6;

function platformTabDefs(isElectron: boolean): SettingsTabDef[] {
  return SETTINGS_TAB_DEFS.filter((def) => !(isElectron && def.webOnly));
}

/** 当前平台的标签列表；value 为位置序号字符串 */
export function settingsTabsFor(isElectron: boolean): SettingsTab[] {
  return platformTabDefs(isElectron).map((def, index) => ({ value: String(index), label: def.label }));
}

export function getSettingsPanelComponent(isElectron: boolean, value: string): Component {
  return platformTabDefs(isElectron)[Number(value)]?.component ?? AIModelSettingsTab;
}

export function savedIndexToTabValue(isElectron: boolean, savedIndex: number): string {
  const defs = platformTabDefs(isElectron);
  let position = defs.findIndex((def) => def.savedIndex === savedIndex);
  if (position < 0 && isElectron && savedIndex === 1) {
    position = defs.findIndex((def) => def.savedIndex === ELECTRON_FALLBACK_SAVED_INDEX);
  }
  return String(Math.max(position, 0));
}

export function tabValueToSavedIndex(isElectron: boolean, value: string): number {
  return platformTabDefs(isElectron)[Number(value)]?.savedIndex ?? 0;
}

function createSettingsPageContext(): SettingsPageContext {
  const settingsStore = useSettingsStore();
  const router = useRouter();
  const { isElectron } = useElectron();

  // 当前选中的标签页值（字符串）
  const activeTab = ref('0');

  const tabs = computed<SettingsTab[]>(() => settingsTabsFor(isElectron.value));

  // 确保 store 已加载
  const ensureStoreLoaded = async () => {
    if (!settingsStore.isLoaded) {
      await settingsStore.loadSettings();
    }
  };

  // 初始化 activeTab（页面挂载时调用）
  const initializeActiveTab = async () => {
    await ensureStoreLoaded();
    activeTab.value = savedIndexToTabValue(isElectron.value, settingsStore.lastOpenedSettingsTab);
  };

  // 处理标签页切换
  const handleTabChange = (value: string | number) => {
    const stringValue = String(value);
    activeTab.value = stringValue;
    if (tabs.value.some((tab) => tab.value === stringValue)) {
      void settingsStore.setLastOpenedSettingsTab(tabValueToSavedIndex(isElectron.value, stringValue));
    }
  };

  // 返回上一页：优先使用浏览器历史，若无历史则回到首页
  const goBack = () => {
    const hasHistory = typeof window !== 'undefined' && window.history && window.history.length > 1;
    if (hasHistory) {
      router.back();
    } else {
      void router.push('/');
    }
  };

  // 页面挂载时初始化
  onMounted(async () => {
    await initializeActiveTab();
  });

  return {
    isElectron,
    activeTab,
    tabs,
    handleTabChange,
    goBack,
  };
}
