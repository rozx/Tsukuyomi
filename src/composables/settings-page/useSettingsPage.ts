import {
  computed,
  inject,
  onMounted,
  provide,
  ref,
  type InjectionKey,
  type Ref,
} from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useSettingsStore } from 'src/stores/settings';
import { useElectron } from 'src/composables/useElectron';
import { isMobileDevice } from 'src/utils/platform';

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
  embeddingSettingsTabValue: Ref<string>;
  handleTabChange: (value: string | number) => void;
  dismissIntro: () => Promise<void>;
  handleIntroLearnMore: () => Promise<void>;
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

function createSettingsPageContext(): SettingsPageContext {
  const settingsStore = useSettingsStore();
  const toast = useToast();
  const router = useRouter();
  const { isElectron } = useElectron();

  // 当前选中的标签页值（字符串）
  const activeTab = ref('0');

  // 显式 tab 列表：Electron 环境移除 "代理设置"（由系统代理处理）。
  // 顺序与 public/help/settings-guide.md 一致：
  //   AI 模型 → (代理设置) → API Keys → 同步设置 → 本地嵌入 → 爬虫设置 → 导入/导出
  const tabs = computed<SettingsTab[]>(() => {
    const list: SettingsTab[] = [{ value: '0', label: 'AI 模型' }];
    if (!isElectron.value) list.push({ value: '1', label: '代理设置' });
    list.push({ value: isElectron.value ? '1' : '2', label: 'API Keys' });
    list.push({ value: isElectron.value ? '2' : '3', label: '同步设置' });
    list.push({ value: isElectron.value ? '3' : '4', label: '本地嵌入' });
    list.push({ value: isElectron.value ? '4' : '5', label: '爬虫设置' });
    list.push({ value: isElectron.value ? '5' : '6', label: '导入/导出' });
    return list;
  });

  // 本地嵌入 tab 的 value（Electron: '3'，否则 '4'）
  const embeddingSettingsTabValue = computed(() => (isElectron.value ? '3' : '4'));

  // ── 持久化映射（保留向后兼容，savedIndex 沿用旧 SettingsDialog 的语义） ──
  // 旧 savedIndex 含义（稳定不变）：
  //   0=AI模型  1=代理设置  2=同步  3=爬虫  4=导入/导出  6=API Keys  7=本地嵌入
  // 新 UI tab value：
  //   非 Electron: 0=AI · 1=代理 · 2=API Keys · 3=同步 · 4=本地嵌入 · 5=爬虫 · 6=导入/导出
  //   Electron:    0=AI · 1=API Keys · 2=同步 · 3=本地嵌入 · 4=爬虫 · 5=导入/导出
  const convertSavedTabIndex = (savedIndex: number): string => {
    if (isElectron.value) {
      switch (savedIndex) {
        case 0:
          return '0'; // AI
        case 1: // 旧代理（Electron 不显示）→ 退回 API Keys
        case 6:
          return '1'; // API Keys
        case 2:
          return '2'; // 同步
        case 7:
          return '3'; // 本地嵌入
        case 3:
          return '4'; // 爬虫
        case 4:
          return '5'; // 导入/导出
        default:
          return '0';
      }
    } else {
      switch (savedIndex) {
        case 0:
          return '0'; // AI
        case 1:
          return '1'; // 代理
        case 6:
          return '2'; // API Keys
        case 2:
          return '3'; // 同步
        case 7:
          return '4'; // 本地嵌入
        case 3:
          return '5'; // 爬虫
        case 4:
          return '6'; // 导入/导出
        default:
          return '0';
      }
    }
  };

  const convertTabValueToIndex = (tabValue: string): number => {
    if (isElectron.value) {
      switch (tabValue) {
        case '0':
          return 0; // AI
        case '1':
          return 6; // API Keys
        case '2':
          return 2; // 同步
        case '3':
          return 7; // 本地嵌入
        case '4':
          return 3; // 爬虫
        case '5':
          return 4; // 导入/导出
        default:
          return 0;
      }
    } else {
      switch (tabValue) {
        case '0':
          return 0; // AI
        case '1':
          return 1; // 代理
        case '2':
          return 6; // API Keys
        case '3':
          return 2; // 同步
        case '4':
          return 7; // 本地嵌入
        case '5':
          return 3; // 爬虫
        case '6':
          return 4; // 导入/导出
        default:
          return 0;
      }
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

  // 本地嵌入首次提示(引导记忆注入 + 章节语义查询)
  // 手机端永久禁用本地嵌入(见 isLocalEmbeddingEffectivelyEnabled 说明),
  // 这条引导 toast 也跳过 —— 向手机用户推销他们用不上的功能只是噪音。
  const showMemoryIntroToast = () => {
    if (isMobileDevice()) return;
    const mi = settingsStore.settings.memoryInjection;
    if (mi && mi.hasSeenIntro) return;
    toast.add({
      group: 'memory-intro',
      severity: 'info',
      summary: '新功能：本地嵌入模型',
      detail: '翻译时自动匹配相关记忆,AI 也能用 query_chapter 语义检索章节。',
      closable: false,
      life: 0,
    });
  };

  const dismissIntro = async () => {
    toast.removeGroup('memory-intro');
    await settingsStore.updateMemoryInjection({ hasSeenIntro: true });
  };

  const handleIntroLearnMore = async () => {
    activeTab.value = embeddingSettingsTabValue.value;
    const savedIndex = convertTabValueToIndex(embeddingSettingsTabValue.value);
    void settingsStore.setLastOpenedSettingsTab(savedIndex);
    await dismissIntro();
  };

  // 返回上一页：优先使用浏览器历史，若无历史则回到首页
  const goBack = () => {
    const hasHistory =
      typeof window !== 'undefined' && window.history && window.history.length > 1;
    if (hasHistory) {
      router.back();
    } else {
      void router.push('/');
    }
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
    embeddingSettingsTabValue,
    handleTabChange,
    dismissIntro,
    handleIntroLearnMore,
    goBack,
  };
}
