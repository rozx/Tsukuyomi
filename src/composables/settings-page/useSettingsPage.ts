import {
  computed,
  inject,
  onMounted,
  provide,
  ref,
  type InjectionKey,
  type Ref,
} from 'vue';
import { useToast } from 'primevue/usetoast';
import { useSettingsStore } from 'src/stores/settings';
import { useElectron } from 'src/composables/useElectron';

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
  memoryInjectionTabValue: Ref<string>;
  handleTabChange: (value: string | number) => void;
  dismissIntro: () => Promise<void>;
  handleIntroLearnMore: () => Promise<void>;
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

function createSettingsPageContext(): SettingsPageContext {
  const settingsStore = useSettingsStore();
  const toast = useToast();
  const { isElectron } = useElectron();

  // 当前选中的标签页值（字符串）
  const activeTab = ref('0');

  // 显式 tab 列表：Electron 环境移除 "代理设置"（由系统代理处理）
  const tabs = computed<SettingsTab[]>(() => {
    const list: SettingsTab[] = [{ value: '0', label: 'AI 模型' }];
    if (!isElectron.value) list.push({ value: '1', label: '代理设置' });
    list.push({ value: isElectron.value ? '1' : '2', label: 'API Keys' });
    list.push({ value: isElectron.value ? '2' : '3', label: '同步设置' });
    list.push({ value: isElectron.value ? '3' : '4', label: '爬虫设置' });
    list.push({ value: isElectron.value ? '4' : '5', label: '导入/导出' });
    list.push({ value: isElectron.value ? '5' : '6', label: '记忆注入' });
    return list;
  });

  // 记忆注入 tab 的 value（Electron: '5'，否则 '6'）
  const memoryInjectionTabValue = computed(() => (isElectron.value ? '5' : '6'));

  // ── 持久化映射（保留向后兼容，逻辑来自旧 SettingsDialog） ──
  // 非 Electron: 0=AI模型, 1=代理设置, 2=API Keys, 3=同步, 4=爬虫, 5=导入, 6=记忆注入
  // Electron:    0=AI模型, 1=API Keys, 2=同步, 3=爬虫, 4=导入, 5=记忆注入
  const convertSavedTabIndex = (savedIndex: number): string => {
    if (isElectron.value) {
      if (savedIndex === 0) return '0';
      if (savedIndex === 1) return '1'; // 代理 → API Keys
      if (savedIndex === 7) return '5'; // 记忆注入
      if (savedIndex >= 2) return String(savedIndex);
      return '0';
    } else {
      if (savedIndex === 6) return '2'; // 新 API Keys
      if (savedIndex === 7) return '6'; // 记忆注入
      if (savedIndex < 2) return String(savedIndex);
      if (savedIndex >= 2 && savedIndex <= 4) return String(savedIndex + 1);
      return '0';
    }
  };

  const convertTabValueToIndex = (tabValue: string): number => {
    const tabIndex = Number(tabValue);
    if (isElectron.value) {
      if (tabIndex === 0) return 0;
      if (tabIndex === 1) return 1;
      if (tabIndex === 5) return 7;
      if (tabIndex >= 2) return tabIndex;
      return 0;
    } else {
      if (tabIndex < 2) return tabIndex;
      if (tabIndex === 2) return 6;
      if (tabIndex === 6) return 7;
      if (tabIndex >= 3) return tabIndex - 1;
      return 0;
    }
  };

  // 确保 store 已加载
  const ensureStoreLoaded = async () => {
    if (!settingsStore.isLoaded) {
      await settingsStore.loadSettings();
    }
  };

  // 初始化 activeTab（页面挂载时调用）
  const initializeActiveTab = async () => {
    await ensureStoreLoaded();
    const lastTab = settingsStore.lastOpenedSettingsTab;
    const tabValue = convertSavedTabIndex(lastTab);
    const maxTabIndex = isElectron.value ? 5 : 6;
    const tabIndex = Number(tabValue);
    activeTab.value = tabIndex >= 0 && tabIndex <= maxTabIndex ? tabValue : '0';
  };

  // 处理标签页切换
  const handleTabChange = (value: string | number) => {
    const stringValue = String(value);
    activeTab.value = stringValue;
    const tabIndex = Number(stringValue);
    const maxTabIndex = isElectron.value ? 5 : 6;
    if (tabIndex >= 0 && tabIndex <= maxTabIndex) {
      const savedIndex = convertTabValueToIndex(stringValue);
      void settingsStore.setLastOpenedSettingsTab(savedIndex);
    }
  };

  // 记忆注入首次提示
  const showMemoryIntroToast = () => {
    const mi = settingsStore.settings.memoryInjection;
    if (mi && mi.hasSeenIntro) return;
    toast.add({
      group: 'memory-intro',
      severity: 'info',
      summary: '新功能：语义记忆检索',
      detail: '翻译时自动匹配最相关的记忆，无需手动关联。',
      closable: false,
      life: 0,
    });
  };

  const dismissIntro = async () => {
    toast.removeGroup('memory-intro');
    await settingsStore.updateMemoryInjection({ hasSeenIntro: true });
  };

  const handleIntroLearnMore = async () => {
    activeTab.value = memoryInjectionTabValue.value;
    const savedIndex = convertTabValueToIndex(memoryInjectionTabValue.value);
    void settingsStore.setLastOpenedSettingsTab(savedIndex);
    await dismissIntro();
  };

  // 页面挂载时初始化 + 首次提示
  onMounted(async () => {
    await initializeActiveTab();
    showMemoryIntroToast();
  });

  return {
    isElectron,
    activeTab,
    tabs,
    memoryInjectionTabValue,
    handleTabChange,
    dismissIntro,
    handleIntroLearnMore,
  };
}
